import type { ExtensionFactSubject, Node, SourceFile, Type, TypeAliasApplicationInfo } from "@tsonic/tsts";
import { sourceTypeSyntaxRoot, type SourceFileSemantics, type SourceStandardTypeTransformation } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeNodeSource } from "../../../objects/shapes/node-source.js";
import type { CsharpObjectShapeTypeSource } from "../../../objects/shapes/type-source.js";
import type { CsharpNodeTypeResolution } from "../../../../policy/model/type-resolution.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { maximumTypeResolutionDepth, type CsharpTypeResolutionState } from "./model.js";
import { formCsharpProjectReferenceSource, formCsharpProjectSemanticSource,
  type CsharpProjectReferenceSource, type CsharpProjectSemanticSource } from "./project-types.js";
import { bindCsharpSourceStorageContext, csharpSourceStorageContext, formCsharpSourceStorageComponentContext,
  type CsharpSourceStorageContextSource } from "./source-storage-projection.js";
import { nextState } from "./state.js";
import { formCsharpTypeReferenceSource, type CsharpTypeReferenceSource } from "./type-reference-source.js";
import { formCsharpSourceTypeBindingEvidence, type CsharpSourceTypeBindingEvidence } from "./type-bindings.js";
import { formCsharpSelectedExpressionSource, type CsharpSelectedExpressionSource } from "./expression-source.js";
import { formCsharpSemanticTypeArgumentsSource, type CsharpSemanticTypeArgumentsSource } from "./semantic-argument-source.js";
import { formCsharpDirectSourceEvidence, type CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";
import { formCsharpDeclaredObjectReceiverInput,
  type CsharpDeclaredObjectReceiverInput } from "./declared-receiver-source.js";
import { formCsharpCallableTypeSource } from "./callable-signature-source.js";
import { formCsharpCallableTypeInput, type CsharpCallableTypeInput } from "./callable-signature-completion.js";
import { formCsharpNativeParameterSource, type CsharpNativeParameterSource } from "./native-parameter-source.js";
import { formCsharpProjectThisSource, type CsharpProjectInstanceSource } from "./project-instance-source.js";
import { formCsharpContextualParameterSource, type CsharpContextualParameterSource } from "./contextual-parameter-source.js";
import { formCsharpSourceTypeComponentSource, type CsharpSourceTypeComponentSource } from "./type-component-source.js";
import { formCsharpSemanticConditionalSource, type CsharpSemanticConditionalSource } from "./semantic-conditional-source.js";
import { formCsharpSourceValueDeclarationSource, formCsharpSourceValueSource, type CsharpSourceValueSource } from "./value-source.js";
import { formCsharpSelectedValueSource, type CsharpSelectedValueSource } from "./selected-value-source.js";
import { formCsharpTupleTypeNodeSource, type CsharpTupleTypeNodeSource } from "./tuple-node-source.js";
import { formCsharpNodeTypeSyntaxSource, type CsharpNodeTypeSyntaxSource } from "./node-syntax-source.js";
import { formCsharpSemanticTupleSource, type CsharpSemanticTupleSource } from "./semantic-tuple-source.js";
import { formCsharpUnionTypeNodeSource, type CsharpUnionTypeNodeSource } from "./union-node-source.js";

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

export type CsharpFunctionTypeNodeSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-function" }
  | { readonly kind: "function"; readonly type: Type | undefined; readonly callable: CsharpCallableTypeInput | undefined }
);

export type CsharpArrayTypeNodeSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-array" }
  | { readonly kind: "array"; readonly elementNode: Node | undefined; readonly fallbackType: Type | undefined;
      readonly storage: CsharpSourceStorageContextSource;
      readonly element: { readonly node: Node | undefined; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState };
      readonly fallback: { readonly type: Type | undefined; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState } }
);

export type CsharpSemanticTypeSource = {
  readonly type: Type | undefined;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "unavailable" }
  | { readonly kind: "type"; readonly type: Type; readonly queries: SourceFileSemantics;
      readonly nonPrimitive: boolean; readonly binding: CsharpSourceTypeBindingEvidence | undefined;
      readonly aliasApplication: TypeAliasApplicationInfo | undefined; readonly conditional: CsharpSemanticConditionalSource;
      readonly subjects: readonly ExtensionFactSubject[]; readonly direct: CsharpDirectSourceEvidence;
      readonly transformation: SourceStandardTypeTransformation | undefined;
      readonly transformationComponent: CsharpSourceTypeComponentSource | undefined;
      readonly callable: CsharpCallableTypeInput;
      readonly arguments: CsharpSemanticTypeArgumentsSource;
      readonly tuple: CsharpSemanticTupleSource;
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
      readonly nativeParameter: CsharpNativeParameterSource;
      readonly contextualParameter: CsharpContextualParameterSource;
      readonly functionType: CsharpFunctionTypeNodeSource;
      readonly arrayType: CsharpArrayTypeNodeSource;
      readonly tupleType: CsharpTupleTypeNodeSource;
      readonly unionType: CsharpUnionTypeNodeSource;
      readonly syntax: CsharpNodeTypeSyntaxSource;
      readonly projectInstance: CsharpProjectInstanceSource;
      readonly selectedType: Type | undefined; readonly project: CsharpProjectReferenceSource | undefined;
      readonly reference: CsharpTypeReferenceSource | undefined;
      readonly selectedExpression: CsharpSelectedExpressionSource;
      readonly value: CsharpSourceValueSource;
      readonly selectedValue: CsharpSelectedValueSource | undefined;
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

export function formCsharpFunctionTypeNodeSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpFunctionTypeNodeSource {
  if (!host.ast.is.IsFunctionTypeNode(node)) return Object.freeze({ kind: "not-function", node, queries, state });
  const type = queries.types.authoredType(node);
  return Object.freeze({ kind: "function", node, queries, state, type,
    callable: type === undefined ? undefined
      : formCsharpCallableTypeInput(host, formCsharpCallableTypeSource(host.ast, type, queries), state),
  });
}

export function formCsharpArrayTypeNodeSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpArrayTypeNodeSource {
  if (!host.ast.is.IsArrayTypeNode(node)) return Object.freeze({ kind: "not-array", node, queries, state });
  const elementNode = host.ast.as.AsArrayTypeNode(node)!.ElementType;
  const storage = formCsharpSourceStorageComponentContext(host, state.sourceStorageSubject, { kind: "array-element" });
  const fallbackType = queries.types.authoredType(node);
  return Object.freeze({ kind: "array", node, queries, state, elementNode, fallbackType, storage,
    element: Object.freeze({ node: elementNode, sourceFile: queries.sourceFile,
      state: Object.freeze(nextState(bindCsharpSourceStorageContext(storage, state))) }),
    fallback: Object.freeze({ type: fallbackType, sourceFile: queries.sourceFile, state: Object.freeze(nextState(state)) }),
  });
}

export function assertCsharpArrayTypeNodeSource(source: CsharpArrayTypeNodeSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      source.kind !== "not-array" && source.kind !== "array" ||
      source.kind === "array" && (source.storage === undefined || source.element === undefined || source.fallback === undefined ||
        source.element.state === undefined || source.fallback.state === undefined ||
        source.storage.inputSubject !== source.state.sourceStorageSubject ||
        source.element.node !== source.elementNode || source.element.sourceFile !== source.queries.sourceFile ||
        source.element.state.depth !== source.state.depth + 1 ||
        source.element.state.sourceStorageSubject !== source.storage.subject ||
        source.element.state.sourceBindings !== source.state.sourceBindings ||
        source.element.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
        source.element.state.rejectNativeResolution !== source.state.rejectNativeResolution ||
        source.fallback.type !== source.fallbackType || source.fallback.sourceFile !== source.queries.sourceFile ||
        source.fallback.state.depth !== source.state.depth + 1 ||
        source.fallback.state.sourceStorageSubject !== source.state.sourceStorageSubject ||
        source.fallback.state.sourceBindings !== source.state.sourceBindings ||
        source.fallback.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
        source.fallback.state.rejectNativeResolution !== source.state.rejectNativeResolution)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "An array-type node requires its exact element, fallback and captured storage Source.", source?.node);
  }
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
  const aliasApplication = queries.types.aliasApplication(type);
  const conditional = formCsharpSemanticConditionalSource(scope, type, queries, state, aliasApplication);
  const transformation = queries.types.standardTransformation(undefined, type);
  const transformationComponent = transformation?.kind !== "component" ? undefined
    : formCsharpSourceTypeComponentSource(scope, transformation.component, queries, nextState(state));
  return Object.freeze({ kind: "type", type, sourceFile, state, queries, nonPrimitive, binding, aliasApplication, conditional, transformation, transformationComponent,
    subjects, direct: formCsharpDirectSourceEvidence(scope, subjects, sourceFile, state),
    callable: formCsharpCallableTypeInput(scope.host, formCsharpCallableTypeSource(scope.host.ast, type, queries), state),
    arguments: formCsharpSemanticTypeArgumentsSource(scope, type, queries, state),
    tuple: formCsharpSemanticTupleSource(scope, type, sourceFile, queries, state),
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
  const selection = formCsharpSourceValueDeclarationSource(scope, node);
  const cycle = reference ? Object.freeze({ type: queries.types.authoredType(node) }) : undefined;
  return Object.freeze({ kind: "node", node, sourceFile, queries, state, originalState, selectedType, declaredReceiver,
    nativeParameter: formCsharpNativeParameterSource(host.ast, node),
    contextualParameter: formCsharpContextualParameterSource(scope, node, queries),
    functionType: formCsharpFunctionTypeNodeSource(scope, node, queries, state),
    arrayType: formCsharpArrayTypeNodeSource(scope, node, queries, state),
    tupleType: formCsharpTupleTypeNodeSource(scope, node, queries, state),
    unionType: formCsharpUnionTypeNodeSource(scope, node, queries, state, cycle?.type),
    syntax: formCsharpNodeTypeSyntaxSource(scope, node, queries, state),
    projectInstance: formCsharpProjectThisSource(host.ast, node),
    directSyntax: formCsharpDirectSourceEvidence(scope, Object.freeze([node]), queries.sourceFile, state),
    directValue: formCsharpDirectSourceEvidence(scope, sourceFactSubjectsForNode(node, host.navigation), queries.sourceFile, state),
    cycle,
    reference: host.ast.is.IsTypeReferenceNode(node) ? formCsharpTypeReferenceSource(scope, node, queries, state) : undefined,
    selectedExpression: formCsharpSelectedExpressionSource(scope, node, queries, state),
    value: formCsharpSourceValueSource(scope, selection, queries, state, undefined),
    selectedValue: selectedType === undefined ? undefined : formCsharpSelectedValueSource(scope, selection, selectedType, queries, state),
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
