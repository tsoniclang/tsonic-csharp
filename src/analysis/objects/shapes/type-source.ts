import type { Node, Type } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpCurrentProjectDeclaration } from "../../source-evidence/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpProjectSemanticSource } from "../../source-evidence/types/resolution/project-types.js";
import type { CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { formCsharpLiteralCreationSource, type CsharpLiteralCreationSource } from "../literal-creation-source.js";
import type { CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import { formCsharpObjectLiteralShapeSource, type CsharpObjectLiteralShapeSource } from "./literal-source.js";
import { formProviderObjectLiteralSource, type CsharpProviderObjectLiteralSource } from "./provider-construction.js";
import { createCsharpProjectDeclarationShapeSource, type CsharpProjectDeclarationShapeSource } from "./project-declaration-source.js";
import { formCollectedObjectShapeSource, formDeclaredObjectShapeSource, formInstantiatedObjectShapeSource,
  formProviderObjectShapeSource, type CsharpObjectShapeSource } from "./shape-source.js";
import { requiresUnresolvedStructuralProjection, typeHasProjectOwnedShapeDeclaration,
  typeIsExcludedFromObjectShape } from "./source-evidence.js";
import { selectCsharpObjectMethodImplementationSource,
  type CsharpObjectMethodImplementationSource } from "./method-implementations.js";
import type { CsharpSourceTypeDependency } from "../../source-evidence/types/resolution/selected-values.js";

export interface CsharpObjectShapeProjectSource {
  readonly definition: CsharpCurrentProjectDeclaration;
  readonly declaration: CsharpProjectDeclarationShapeSource | undefined;
  readonly declared: CsharpObjectShapeSource | undefined;
  readonly instantiated: CsharpObjectShapeSource | undefined;
  readonly instanceType: Type | undefined;
}

export interface CsharpObjectShapeTypeSource {
  readonly type: Type;
  readonly node: Node | undefined;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
  readonly project: CsharpProjectSemanticSource;
  readonly provider: CsharpProviderObjectLiteralSource | undefined;
  readonly providerShape: CsharpObjectShapeSource | undefined;
  readonly projects: readonly CsharpObjectShapeProjectSource[];
  readonly members: CsharpStructuralTypeSource | undefined;
  readonly collected: CsharpObjectShapeSource | undefined;
  readonly projectOwned: boolean;
  readonly objectLiteral: boolean;
  readonly constructs: boolean;
  readonly literal: CsharpObjectLiteralShapeSource | undefined;
  readonly creation: CsharpLiteralCreationSource | undefined;
  readonly implementation: CsharpObjectMethodImplementationSource | undefined;
  readonly implementationCaptures: readonly CsharpSourceTypeDependency[];
  readonly structuralContract: boolean;
}

export function createCsharpObjectShapeSourceFormation(
  host: CsharpObjectShapePolicyHost,
  collectMembers: (type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node) => CsharpCollectedObjectShapeMembers | undefined,
) {
  const { formProjectDeclarationSource } = createCsharpProjectDeclarationShapeSource(host, collectMembers);

  function formTypeSource(
    type: Type,
    node: Node | undefined,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot: Node | undefined,
    project: CsharpProjectSemanticSource,
  ): CsharpObjectShapeTypeSource | undefined {
    if (project.type !== type || project.queries !== queries || project.state !== state) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A structural source occurrence requires its exact checked project input.", node);
    }
    if (requiresUnresolvedStructuralProjection(type, node, queries, host) ||
      typeIsExcludedFromObjectShape(type, queries, host)) return undefined;
    const provider = formProviderObjectLiteralSource({ type, queries, state, authoredTypeRoot, host });
    const providerShape = provider === undefined ? undefined : formProviderObjectShapeSource(provider);
    const projects = new Map<Node, CsharpObjectShapeProjectSource>();
    for (const owner of project.owners) {
      for (const selected of owner.declarations) {
        if (projects.has(selected)) continue;
        const definition = host.projectDeclarations.declarationForNode(selected);
        if (definition === undefined) continue;
        const declaration = formProjectDeclarationSource(selected, state);
        const declared = declaration === undefined ? undefined : formDeclaredObjectShapeSource(declaration);
        const instantiated = declared === undefined ? undefined : formInstantiatedObjectShapeSource(declared, type, queries);
        projects.set(selected, Object.freeze({ definition, declaration, declared, instantiated,
          instanceType: definition.kind === "class" ? queries.declarations.declaredType(selected) : undefined,
        }));
      }
    }
    const objectLiteral = node !== undefined && host.ast.is.IsObjectLiteralExpression(node);
    const symbol = queries.declarations.typeSymbol(type);
    const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
    const literals = declarations.filter(declaration => host.ast.is.IsObjectLiteralExpression(declaration));
    const authoredLiteral = objectLiteral ? node : literals.length === 1 ? literals[0] : undefined;
    const collection = collectMembers(type, queries, nextState(state), authoredTypeRoot);
    const members = collection === undefined ? undefined : host.structuralTypeApplication(collection);
    const implementation = collection === undefined ? undefined : selectCsharpObjectMethodImplementationSource(
      collection.members.map(member => Object.freeze({ memberKind: member.method ? "method" as const : "property" as const,
        sourceDeclarations: member.proofInput.sourceDeclarations,
      })), host, state, authoredLiteral);
    const implementationCaptures = implementation === undefined ? [] : implementation.captures.map(capture =>
      Object.freeze({ kind: "node" as const, node: capture.declaration,
        sourceFile: capture.sourceFile ?? host.semanticsFor(capture.declaration).sourceFile,
        state: Object.freeze(nextState(state)),
      }));
    return Object.freeze({ type, node, queries, state, authoredTypeRoot, project, provider, providerShape,
      projects: Object.freeze([...projects.values()]), members,
      collected: collection === undefined ? undefined : formCollectedObjectShapeSource(collection),
      projectOwned: typeHasProjectOwnedShapeDeclaration(type, node ?? authoredTypeRoot, queries, host),
      objectLiteral, constructs: queries.types.constructSignatures(type).length > 0,
      literal: authoredLiteral === undefined ? undefined : formCsharpObjectLiteralShapeSource(host, authoredLiteral, queries),
      creation: authoredLiteral === undefined ? undefined : formCsharpLiteralCreationSource(authoredLiteral, queries, host),
      implementation, implementationCaptures: Object.freeze(implementationCaptures),
      structuralContract: !objectLiteral && (queries.types.isIntersection(type) || symbol !== undefined &&
        declarations.some(declaration => host.ast.is.IsTypeLiteralNode(declaration) || host.ast.is.IsMappedTypeNode(declaration))),
    });
  }

  return Object.freeze({ formTypeSource, formProjectDeclarationSource });
}
