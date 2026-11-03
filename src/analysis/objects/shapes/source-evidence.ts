import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import { sourceTypeIsAuthoredEmptyObject } from "@tsonic/target-api/source";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { formAuthoredAndSelectedSourceType,
  type CsharpAuthoredTypeSelectionEvidence } from "../../source-evidence/types/resolution/selected-values.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

interface SelectedObjectShapeSource {
  readonly type: Type | undefined;
  readonly contextualTarget?: TargetTypeRef;
  readonly origin: "semantic" | "contextual";
}

export interface CsharpContextualObjectShapeSource {
  readonly component: SourceTypeComponentEvidence;
  readonly projectDeclaration: boolean;
  readonly selection: CsharpAuthoredTypeSelectionEvidence;
}

export interface CsharpObjectShapeSourceFormation {
  readonly node: Node;
  readonly type: Type | undefined;
  readonly contextual: CsharpContextualObjectShapeSource | undefined;
}

export function formSelectedObjectShapeSource(
  node: Node,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
): CsharpObjectShapeSourceFormation {
  if (host.ast.is.IsClassDeclaration(node) || host.ast.is.IsClassExpression(node)) {
    return Object.freeze({ node, type: queries.declarations.declaredType(node), contextual: undefined });
  }
  const semanticType = queries.types.expressionType(node);
  if (!host.ast.is.IsObjectLiteralExpression(node)) {
    return Object.freeze({ node, type: semanticType, contextual: undefined });
  }
  const contextual = queries.types.contextualValueSelection(node);
  if (contextual.kind !== "selected") {
    return Object.freeze({ node, type: semanticType, contextual: undefined });
  }
  const contextualType = contextual.component.selectedType;
  const contextualSymbol = queries.declarations.typeAliasSymbol(contextualType) ??
    queries.declarations.typeSymbol(contextualType);
  const contextualDeclarations = contextualSymbol === undefined
    ? []
    : queries.declarations.symbolDeclarations(contextualSymbol);
  const projectDeclaration = contextualDeclarations.some((declaration) =>
      declaration !== undefined &&
      host.navigation.isProjectDeclaration(declaration) &&
      (
        host.ast.is.IsClassDeclaration(declaration) ||
        host.ast.is.IsInterfaceDeclaration(declaration)
      )
    );
  const providerDeclaration = [
    ...queries.facts.typeSubjects(contextualType),
    ...(contextualSymbol === undefined
      ? []
      : [contextualSymbol, ...contextualDeclarations]),
  ].some((subject) =>
    subject !== undefined &&
    host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined
  );
  if (!projectDeclaration && !providerDeclaration) {
    return Object.freeze({ node, type: semanticType, contextual: undefined });
  }
  return Object.freeze({ node, type: semanticType, contextual: Object.freeze({
    component: contextual.component, projectDeclaration,
    selection: formAuthoredAndSelectedSourceType({ host }, contextual.component.authoredTypeNode,
      queries.sourceFile, contextualType, queries.sourceFile, nextState(state)),
  }) });
}

export function completeSelectedObjectShapeSource(
  source: CsharpObjectShapeSourceFormation,
  completed: { readonly dependency: CsharpContextualObjectShapeSource;
    readonly targetType: TargetTypeRef | undefined } | undefined,
): SelectedObjectShapeSource {
  const contextual = source.contextual;
  if (contextual === undefined) {
    if (completed !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A semantic object-shape origin has no contextual native child.", source.node);
    return Object.freeze({ type: source.type, origin: "semantic" });
  }
  if (completed?.dependency !== contextual) return failTargetAnalysisInvariant("tsonic-csharp",
    "An object-shape origin requires its exact contextual native child.", source.node);
  const contextualTarget = completed.targetType;
  if (contextualTarget === undefined) {
    return Object.freeze({ type: source.type, origin: "semantic" });
  }
  if (contextual.projectDeclaration && !isProjectSourceTargetType(contextualTarget)) {
    return Object.freeze({ type: source.type, origin: "semantic" });
  }
  return Object.freeze({ type: contextual.component.selectedType, contextualTarget, origin: "contextual" });
}

export function sourceSubjects(
  node: Node,
  queries: SourceFileSemantics,
): readonly ExtensionFactSubject[] {
  return Object.freeze([
    ...new Set<ExtensionFactSubject>([
      node,
      ...queries.facts.authoredTypeSubjects(node),
    ]),
  ]);
}

export function requiresUnresolvedStructuralProjection(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  if (!queries.types.couldContainTypeVariables(type) ||
    sourceTypeIsAuthoredEmptyObject(type, host.ast, queries, host.navigation)) {
    return false;
  }
  if (
    node !== undefined &&
    (
      host.ast.is.IsTypeLiteralNode(node) ||
      host.ast.is.IsObjectLiteralExpression(node)
    )
  ) {
    return false;
  }
  return queries.types.propertyInfos(type).length === 0;
}

export function typeIsExcludedFromObjectShape(
  type: Type,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const profile = classifyCsharpSourceProfileType(type, queries, host.ast);
  return queries.types.isAny(type) ||
    queries.types.isUnknown(type) ||
    queries.types.isNever(type) ||
    queries.types.isVoidLike(type) ||
    queries.types.isNullish(type) ||
    queries.types.isStringLike(type) ||
    queries.types.isNumberLike(type) ||
    queries.types.isBooleanLike(type) ||
    queries.types.isBigIntLike(type) ||
    (profile !== undefined && (profile.kind !== "record" || queries.types.indexInfos(type).length > 0)) ||
    queries.types.isUnion(type) ||
    queries.types.isTuple(type) ||
    queries.types.callSignatures(type).length > 0 ||
    queries.types.constructSignatures(type).length > 0;
}

export function isCsharpNativeSourceProfileMemberDeclaration(
  declaration: Node,
  ast: CsharpObjectShapePolicyHost["ast"],
): boolean {
  const parent = ast.parent(declaration);
  const owner = parent !== undefined && ast.is.IsTypeLiteralNode(parent) ? ast.parent(parent) : parent;
  return owner !== undefined && classifyCsharpSourceProfileDeclaration(owner, ast) !== undefined;
}

export function typeHasProjectOwnedShapeDeclaration(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const typeSymbols = [
    queries.declarations.typeAliasSymbol(type),
    queries.declarations.typeSymbol(type),
  ];
  const typeSubjects: ExtensionFactSubject[] = [type];
  for (const symbol of typeSymbols) {
    if (symbol === undefined) {
      continue;
    }
    typeSubjects.push(symbol);
    for (const declaration of queries.declarations.symbolDeclarations(symbol)) {
      if (declaration !== undefined) {
        typeSubjects.push(declaration);
      }
    }
  }
  if (typeSubjects.some((subject) =>
    host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined
  )) {
    return false;
  }
  const properties = queries.types.propertyInfos(type);
  const memberDeclarations = properties.map(property => [...new Set([
    ...queries.declarations.symbolDeclarations(property.symbol),
    ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
  ])]);
  const sourceProfileDataMember = (declaration: Node): boolean => {
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file) || !host.ast.is.IsPropertySignatureDeclaration(declaration)) return false;
    const parent = host.ast.parent(declaration);
    if (parent === undefined) return false;
    const literal = host.ast.is.IsTypeLiteralNode(parent);
    const owner = literal ? host.ast.parent(parent) : parent;
    if (owner === undefined || (literal
      ? !host.ast.is.IsTypeAliasDeclaration(owner) || host.ast.as.AsTypeAliasDeclaration(owner)?.Type !== parent
      : !host.ast.is.IsInterfaceDeclaration(owner))) return false;
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.semantics(file), host.sourceFacts, owner);
    const members = host.ast.members(parent);
    return identity?.kind === "type" && identity.declaration === owner &&
      classifyCsharpSourceProfileDeclaration(owner, host.ast) === undefined && members.includes(declaration) &&
      members.every(member => member !== undefined && host.ast.is.IsPropertySignatureDeclaration(member)) &&
      queries.types.callSignatures(type).length === 0 && queries.types.constructSignatures(type).length === 0 &&
      queries.types.indexInfos(type).length === 0;
  };
  if (!memberDeclarations.every(declarations => declarations.every(declaration => {
    if (declaration === undefined) return false;
    if (host.navigation.isProjectDeclaration(declaration)) return true;
    if (isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast)) return true;
    const identity = host.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
    if (identity === undefined) return sourceProfileDataMember(declaration);
    const selection = host.providers.resolveMember(identity);
    return selection.kind === "resolved" && selection.relations.length === 1 &&
      selection.relations[0]!.kind === "member";
  }))) {
    return false;
  }
  if (node !== undefined && host.navigation.isProjectDeclaration(node) &&
    queries.types.standardTransformation(node, type)?.kind === "structural") {
    return true;
  }
  if (node !== undefined &&
    (host.ast.is.IsObjectLiteralExpression(node) || host.ast.is.IsTypeLiteralNode(node)) &&
    host.navigation.isProjectDeclaration(node)) {
    return true;
  }
  if (
    node !== undefined &&
    host.navigation.isProjectDeclaration(
      host.navigation.declarationFor(node),
    )
  ) {
    return true;
  }
  if (typeSymbols.some((symbol) =>
    symbol !== undefined && queries.declarations.symbolDeclarations(symbol).some((declaration) =>
      host.navigation.isProjectDeclaration(declaration)
    )
  )) {
    return true;
  }
  return properties.length > 0 && memberDeclarations.every(declarations => declarations.length > 0);
}

export function typeIncludesNullish(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.types.isNullish(type) ||
    (
      queries.types.isUnion(type) &&
      queries.types.unionOrIntersectionTypes(type).some((member) =>
        member !== undefined && queries.types.isNullish(member)
      )
    );
}
export function isProjectSourceTargetType(
  type: TargetTypeRef,
): type is CsharpTargetNamedTypeRef {
  return type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== undefined;
}

export function projectClassIsObjectInitializable(
  type: Type,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) {
    return false;
  }
  const declarations = queries.declarations.symbolDeclarations(symbol)
    .filter((declaration): declaration is Node =>
      declaration !== undefined &&
      host.ast.is.IsClassDeclaration(declaration) &&
      host.navigation.isProjectDeclaration(declaration)
    );
  if (declarations.length !== 1) {
    return false;
  }
  const constructors = host.navigation.classConstructors(declarations[0]!);
  return constructors.kind === "resolved" &&
    constructors.signatures.some((signature) =>
      signature.parameters.every((parameter) => parameter.acceptsOmission)
    );
}
