import type { ExtensionFactSubject, Node, SourceFile, Type } from "@tsonic/tsts";
import { sourceTypeSyntaxRoot, type SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeNodeSource } from "../../../objects/shapes/node-source.js";
import type { CsharpObjectShapeTypeSource } from "../../../objects/shapes/type-source.js";
import type { CsharpNodeTypeResolution } from "../../../../policy/model/type-resolution.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { maximumTypeResolutionDepth, type CsharpTypeResolutionState } from "./model.js";
import { formCsharpProjectReferenceSource, formCsharpProjectSemanticSource,
  type CsharpProjectReferenceSource, type CsharpProjectSemanticSource } from "./project-types.js";
import { csharpSourceStorageContext } from "./source-storage-projection.js";
import { nextState } from "./state.js";
import { formCsharpTypeReferenceSource, type CsharpTypeReferenceSource } from "./type-reference-source.js";
import { formCsharpSourceTypeBindingEvidence, type CsharpSourceTypeBindingEvidence } from "./type-bindings.js";
import { formCsharpSelectedExpressionSource, type CsharpSelectedExpressionSource } from "./expression-source.js";
import { formCsharpSemanticTypeArgumentsSource, type CsharpSemanticTypeArgumentsSource } from "./semantic-argument-source.js";
import { formCsharpDirectSourceEvidence, type CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";
import { formCsharpDeclaredObjectReceiverInput,
  type CsharpDeclaredObjectReceiverInput } from "./declared-receiver-source.js";

export interface CsharpStructuralNodeSourceInput {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly source: CsharpObjectShapeNodeSource | undefined;
}

export interface CsharpStructuralTypeSourceInput {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
  readonly source: CsharpObjectShapeTypeSource | undefined;
}

export type CsharpSemanticTypeSource = {
  readonly type: Type | undefined;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "unavailable" }
  | { readonly kind: "type"; readonly type: Type; readonly queries: SourceFileSemantics;
      readonly nonPrimitive: boolean; readonly binding: CsharpSourceTypeBindingEvidence | undefined;
      readonly subjects: readonly ExtensionFactSubject[]; readonly direct: CsharpDirectSourceEvidence;
      readonly arguments: CsharpSemanticTypeArgumentsSource;
      readonly project: CsharpProjectSemanticSource; readonly structural: CsharpStructuralTypeSourceInput }
);

export type CsharpNodeTypeSource = {
  readonly node: Node | undefined;
  readonly sourceFile: SourceFile | undefined;
  readonly state: CsharpTypeResolutionState;
  readonly originalState: CsharpTypeResolutionState;
  readonly cycle: { readonly type: Type | undefined } | undefined;
} & (
  | { readonly kind: "unavailable" }
  | { readonly kind: "node"; readonly node: Node; readonly queries: SourceFileSemantics;
      readonly declaredReceiver: CsharpDeclaredObjectReceiverInput | undefined;
      readonly selectedType: Type | undefined; readonly project: CsharpProjectReferenceSource | undefined;
      readonly reference: CsharpTypeReferenceSource | undefined;
      readonly selectedExpression: CsharpSelectedExpressionSource;
      readonly directSyntax: CsharpDirectSourceEvidence; readonly directValue: CsharpDirectSourceEvidence;
      readonly structural: CsharpStructuralNodeSourceInput; readonly semantic: CsharpSemanticTypeSource }
);

export interface CsharpNodeQuerySource {
  readonly node: Node | undefined;
  readonly sourceFile: SourceFile | undefined;
  readonly root: CsharpNodeTypeSource;
  readonly captureRejections: <Value>(
    record: (rejection: Extract<CsharpNodeTypeResolution, { readonly kind: "rejected" }>) => void,
    complete: () => Value,
  ) => Value;
}

export interface CsharpTypeQuerySource {
  readonly type: Type | undefined;
  readonly sourceFile: SourceFile;
  readonly root: CsharpSemanticTypeSource;
}

export function formCsharpStructuralTypeSourceInput(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredTypeRoot?: Node,
): CsharpStructuralTypeSourceInput {
  const source = host.structuralTypes.formTypeSource(type, queries, state, authoredTypeRoot);
  if (source !== undefined && (source.type !== type || source.queries !== queries ||
      source.state !== state || source.authoredTypeRoot !== authoredTypeRoot)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A structural type root requires its exact retained source occurrence.", authoredTypeRoot);
  }
  return Object.freeze({ type, queries, state, authoredTypeRoot, source });
}

export function resolveStructuralTypeWithState(
  scope: CsharpTypeResolutionScope,
  type: Type,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  authoredTypeRoot?: Node,
): TargetTypeRef | undefined {
  return scope.host.structuralTypes.completeTypeSource(formCsharpStructuralTypeSourceInput(
    scope, type, scope.host.semantics(sourceFile), state, authoredTypeRoot));
}

export function formCsharpSemanticTypeSource(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): CsharpSemanticTypeSource {
  if (type === undefined || state.depth > maximumTypeResolutionDepth) {
    return Object.freeze({ kind: "unavailable", type, sourceFile, state });
  }
  const queries = scope.host.semantics(sourceFile);
  const nonPrimitive = queries.types.isNonPrimitive(type);
  const binding = nonPrimitive || state.sourceBindings === undefined ? undefined
    : formCsharpSourceTypeBindingEvidence(type, queries);
  const subjects = queries.facts.typeSubjects(type);
  return Object.freeze({ kind: "type", type, sourceFile, state, queries, nonPrimitive, binding,
    subjects, direct: formCsharpDirectSourceEvidence(scope, subjects, sourceFile, state),
    arguments: formCsharpSemanticTypeArgumentsSource(scope, type, queries, state),
    project: formCsharpProjectSemanticSource(scope, type, queries, state),
    structural: formCsharpStructuralTypeSourceInput(scope, type, queries, nextState(state)),
  });
}

export function formCsharpNodeTypeSource(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpNodeTypeSource {
  const { host } = scope;
  const originalState = state;
  if (node === undefined) return Object.freeze({ kind: "unavailable", node, sourceFile, state, originalState, cycle: undefined });
  const ignored = host.ast.is.IsSourceFile(node) || host.ast.is.IsImportDeclaration(node) ||
    host.ast.is.IsImportClause(node) || host.ast.kindName(node) === "KindEndOfFile";
  const root = sourceTypeSyntaxRoot(host.ast, node);
  const reference = host.ast.is.IsTypeReferenceNode(root) || host.ast.is.IsUnionTypeNode(root) || host.ast.is.IsTypeLiteralNode(root);
  if (ignored || state.depth > maximumTypeResolutionDepth) {
    const queries = reference ? sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile) : undefined;
    return Object.freeze({ kind: "unavailable", node, sourceFile, state, originalState,
      cycle: queries === undefined ? undefined : Object.freeze({ type: queries.types.authoredType(node) }) });
  }
  const queries = sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile);
  state = csharpSourceStorageContext(host, state, node);
  const receiverContext = host.declaredObjectReceivers.get(node);
  const childState = Object.freeze(nextState(state));
  const selectedType = queries.types.expressionType(node);
  const declaredReceiver = receiverContext === undefined ? undefined : formCsharpDeclaredObjectReceiverInput(host, {
    node, queries, state, context: receiverContext, selectedType,
  });
  const source = host.structuralTypes.formNodeSource(node, queries, childState);
  if (source !== undefined && (source.node !== node || source.queries !== queries || source.state !== childState)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A structural node root requires its exact retained source occurrence.", node);
  }
  return Object.freeze({ kind: "node", node, sourceFile, queries, state, originalState, selectedType, declaredReceiver,
    directSyntax: formCsharpDirectSourceEvidence(scope, Object.freeze([node]), queries.sourceFile, state),
    directValue: formCsharpDirectSourceEvidence(scope, sourceFactSubjectsForNode(node, host.navigation), queries.sourceFile, state),
    cycle: reference ? Object.freeze({ type: queries.types.authoredType(node) }) : undefined,
    reference: host.ast.is.IsTypeReferenceNode(node) ? formCsharpTypeReferenceSource(scope, node, queries, state) : undefined,
    selectedExpression: formCsharpSelectedExpressionSource(scope, node, queries, state),
    project: formCsharpProjectReferenceSource(scope, node, queries.sourceFile, state),
    structural: Object.freeze({ node, queries, state: childState, source }),
    semantic: formCsharpSemanticTypeSource(scope, selectedType, queries.sourceFile, childState),
  });
}

export function formCsharpNodeQuerySource(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): CsharpNodeQuerySource {
  type Rejection = Extract<CsharpNodeTypeResolution, { readonly kind: "rejected" }>;
  let receiver: ((rejection: Rejection) => void) | undefined;
  const root = formCsharpNodeTypeSource(scope, node, sourceFile, { depth: 0,
    rejectNativeResolution: rejection => {
      if (receiver === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A retained node query rejection requires its active native completion.", node);
      receiver(rejection);
    } });
  return Object.freeze({ node, sourceFile, root,
    captureRejections<Value>(record: (rejection: Rejection) => void, complete: () => Value): Value {
      const previous = receiver;
      receiver = record;
      try { return complete(); } finally { receiver = previous; }
    },
  });
}

export function formCsharpTypeQuerySource(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
): CsharpTypeQuerySource {
  return Object.freeze({ type, sourceFile, root: formCsharpSemanticTypeSource(scope, type, sourceFile, { depth: 0 }) });
}
