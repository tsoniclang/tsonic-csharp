import { providerVirtualDeclarationFactKey, type Node, type Type } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped, type SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { formCsharpLiteralCreationSource, selectCsharpLiteralCreationContext,
  type CsharpLiteralContext, type CsharpLiteralCreationSource } from "./literal-creation-source.js";
import { formCsharpNativeConstructionPublicationSource,
  type CsharpNativeConstructionPublicationInput, type CsharpNativeConstructionPublicationSource } from "./native-construction-publication.js";
import { formCsharpNativeConstructionMemberSource,
  type CsharpNativeConstructionMemberSource } from "./native-construction-members.js";

type CsharpNativeConstructionSourceHost = Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "sourceFiles" | "semanticsFor" | "providers" | "sourceFacts">;

export interface CsharpNativeConstructionPublication<ShapeSource extends object> extends CsharpNativeConstructionPublicationSource {
  readonly originalShape: ShapeSource | undefined;
}

export interface CsharpLocalConstructionSource<ShapeSource extends object> {
  readonly declaration: Node;
  readonly type: Type;
  readonly expression: Node | undefined;
  readonly queries: SourceFileSemantics;
  readonly originalShape: ShapeSource;
  readonly publications: readonly CsharpNativeConstructionPublication<ShapeSource>[];
}

export interface CsharpLiteralConstructionSource<ShapeSource extends object> {
  readonly kind: "literal";
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly type: Type;
  readonly creation: CsharpLiteralCreationSource;
  readonly context: CsharpLiteralContext | undefined;
  readonly selectedType: Type | undefined;
  readonly asynchronous: boolean;
  readonly any: boolean;
  readonly untyped: boolean;
  readonly unknown: boolean;
  readonly selectedSubjects: ReturnType<SourceFileSemantics["facts"]["typeSubjects"]>;
  readonly nativeProvider: boolean;
  readonly correspondence: CsharpNativeConstructionMemberSource | undefined;
  readonly expectedShape: ShapeSource | undefined;
  readonly originalShape: ShapeSource;
  readonly local: CsharpLocalConstructionSource<ShapeSource> | undefined;
  readonly publications: readonly CsharpNativeConstructionPublication<ShapeSource>[];
}

export interface CsharpNativeConstructionSource<ShapeSource extends object> {
  readonly input: CsharpNativeConstructionSourceHost;
  readonly tasks: readonly (CsharpLiteralConstructionSource<ShapeSource> |
    { readonly kind: "local"; readonly source: CsharpLocalConstructionSource<ShapeSource> })[];
  publicationFor(node: Node): CsharpNativeConstructionPublication<ShapeSource> | undefined;
}

export function formCsharpNativeConstructionSource<ShapeSource extends object>(
  host: CsharpNativeConstructionSourceHost,
  publicationInput: (node: Node, queries: SourceFileSemantics) => CsharpNativeConstructionPublicationInput,
  shapeInput: (type: Type, queries: SourceFileSemantics, authoredTypeRoot: Node | undefined) => ShapeSource,
): CsharpNativeConstructionSource<ShapeSource> {
  const publications = new Map<Node, CsharpNativeConstructionPublication<ShapeSource>>();
  const tasks: CsharpNativeConstructionSource<ShapeSource>["tasks"][number][] = [];
  const publication = (node: Node): CsharpNativeConstructionPublication<ShapeSource> => {
    const existing = publications.get(node);
    if (existing !== undefined) return existing;
    const queries = host.semanticsFor(node);
    const input = publicationInput(node, queries);
    if (input.node !== node || input.queries !== queries) return failTargetAnalysisInvariant("tsonic-csharp",
      "Construction source requires the original checked publication occurrence.", node);
    const selected = formCsharpNativeConstructionPublicationSource(input);
    const source = Object.freeze({ ...selected, originalShape: selected.presentTypes.length !== 1 ? undefined
      : shapeInput(selected.presentTypes[0]!, queries, node) });
    publications.set(node, source);
    return source;
  };
  const declarationPublications = (declaration: Node): readonly CsharpNativeConstructionPublication<ShapeSource>[] =>
    Object.freeze([publication(declaration), ...host.navigation.referencesToDeclaration(declaration).map(publication)]);
  const local = (declaration: Node, type: Type, expression?: Node): CsharpLocalConstructionSource<ShapeSource> | undefined => {
    if (sourceDeclarationIsModuleScoped(declaration, host.ast)) return undefined;
    const summary = host.navigation.declarationUseSummary(declaration);
    if (summary.bindingWritten || summary.memberWritten || summary.identityCompared || summary.aliasedOrStored ||
      summary.exported || summary.hasUnclassifiedValueUse || summary.conditionallyRead ||
      summary.escapeKinds.some(kind => kind !== "capture") || summary.uses.length === 0 ||
      summary.uses.some(use => use.kind !== "type-only" && (use.role !== "receiver" || !use.throughMember))) return undefined;
    const queries = host.semanticsFor(declaration);
    const original = publication(expression ?? declaration);
    return Object.freeze({ declaration, type, expression, queries,
      originalShape: original.queries === queries && original.type === type && original.presentTypes.length === 1
        ? original.originalShape! : shapeInput(type, queries, expression ?? declaration),
      publications: Object.freeze([
        ...(expression === undefined ? [] : [publication(expression)]), ...declarationPublications(declaration),
      ]) });
  };
  const visit = (node: Node): void => {
    host.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    if (host.ast.is.IsObjectLiteralExpression(node) && host.navigation.isProjectDeclaration(node)) {
      const selected = publication(node);
      const { queries, type } = selected;
      if (type !== undefined && queries.types.constructSignatures(type).length === 0) {
        const creation = formCsharpLiteralCreationSource(node, queries, host);
        const selectedContext = selectCsharpLiteralCreationContext(creation);
        const context = selectedContext === undefined ? undefined : Object.freeze(selectedContext);
        const contextual = context?.component.selectedType;
        const asynchronous = context?.returnedFrom !== undefined && host.ast.hasModifierKind(context.returnedFrom, "async");
        const selectedType = contextual !== undefined && asynchronous ? queries.types.typeArguments(contextual)[0] : contextual;
        const any = selectedType !== undefined && queries.types.isAny(selectedType);
        const untyped = !any && host.ast.properties(node).length === 0 && selectedType === undefined;
        const selectedSubjects = Object.freeze(!any && !untyped && selectedType !== undefined
          ? queries.facts.typeSubjects(selectedType) : []);
        const nativeProvider = selectedType !== undefined && selectedSubjects.some(subject => {
          const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
          if (fact === undefined) return false;
          const provider = host.providers.resolveType(fact);
          return provider.kind === "resolved" && provider.relations.some(relation =>
            relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
        });
        const declaration = !any && !untyped && context === undefined ? host.ast.parent(node) : undefined;
        const variable = declaration === undefined || !host.ast.is.IsVariableDeclaration(declaration)
          ? undefined : host.ast.as.AsVariableDeclaration(declaration);
        tasks.push(Object.freeze({ kind: "literal", node, queries, type, creation, context, selectedType, asynchronous, any, untyped,
          unknown: !any && !untyped && selectedType !== undefined && queries.types.isUnknown(selectedType),
          selectedSubjects, nativeProvider,
          correspondence: nativeProvider && selectedType !== undefined
            ? formCsharpNativeConstructionMemberSource(type, selectedType, queries) : undefined,
          expectedShape: any || untyped || selectedType === undefined ? undefined
            : shapeInput(selectedType, queries, asynchronous ? undefined : context?.component.authoredTypeNode),
          originalShape: selected.presentTypes.length === 1 && selected.presentTypes[0] === type
            ? selected.originalShape! : shapeInput(type, queries, node),
          local: variable?.Initializer === node ? local(declaration!, type, node) : undefined,
          publications: Object.freeze([selected,
            ...(!any && !untyped ? context?.declarations ?? [] : []).flatMap(declarationPublications),
          ]),
        }));
      }
    }
    if (host.ast.is.IsBindingElement(node) && host.ast.as.AsBindingElement(node)?.DotDotDotToken !== undefined &&
      host.ast.is.IsObjectBindingPattern(host.ast.parent(node)) && host.navigation.isProjectDeclaration(node)) {
      const selected = publication(node);
      const source = selected.type === undefined ? undefined : local(node, selected.type);
      if (source !== undefined) tasks.push(Object.freeze({ kind: "local", source }));
    }
  };
  for (const sourceFile of host.sourceFiles) visit(sourceFile);
  return Object.freeze({ input: Object.freeze({ ast: host.ast, navigation: host.navigation,
    sourceFiles: host.sourceFiles, semanticsFor: host.semanticsFor, providers: host.providers,
    sourceFacts: host.sourceFacts }), tasks: Object.freeze(tasks),
    publicationFor: (node: Node) => publications.get(node) });
}
