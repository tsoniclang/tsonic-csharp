import type { ExtensionFactSubject, Node, SourceFile, Symbol, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";

import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";

import type { CsharpSourceCallContractSelection, CsharpSourceCallContractSource } from "./call-contracts.js";

import type { CsharpPointerReturnContract } from "../../../../target-model/records/calls/pointer-return.js";
import type { CsharpSourceTypedLocationOperation } from "../../../../source/extension/typed-locations.js";
import type { CsharpTypePolicyHost, CsharpScopedTypePolicyResult, CsharpTypePolicy, CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallParameterReadDomain, ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceTargetTypeBinding } from "../../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { type CsharpSourceUnionIndex } from "./source-unions.js";
import { createCsharpSourceUnionDefinitions } from "./union-definitions.js";

import { type CsharpArrayLiteralSelection } from "../../../../target-model/records/operations/array-literals.js";

import type { createCsharpTypePolicy } from "./engine.js";
import type { CsharpNodeTypeResolution } from "../../../../policy/model/type-resolution.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { CsharpCollectedObjectShapeMembers } from "../../../objects/shapes/member-source.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralPropertyApplication,
  CsharpStructuralTypeApplication, CsharpStructuralTypeSource } from "./structural-applications.js";
import type { CsharpNodeQuerySource, CsharpTypeQuerySource, CsharpNodeTypeSource, CsharpSemanticTypeSource } from "./root-sources.js";
import type { CsharpTypeReferenceSource } from "./type-reference-source.js";
import type { CsharpSelectedExpressionSource } from "./expression-source.js";
import type { CsharpSourceCallResultSource } from "./call-result-source.js";
import type { CsharpSemanticTypeArgumentsSource } from "./semantic-argument-source.js";
import type { CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import type { CsharpSourceCallInference } from "./call-inference.js";
import type { CsharpSourceCallableTypeInput, CsharpSourceCallableTypeCompletion } from "./call-type-source.js";
import type { CsharpSelectedReceiverInput, CsharpSelectedReceiverCompletion,
  CsharpSourceCallReceiverInput, CsharpSourceCallReceiverCompletion } from "./receiver-completions.js";
import type { CsharpSourceOwnedConstructionSource } from "./expression-source.js";
import type { CsharpSourceValueSource } from "./value-source.js";
import type { CsharpSelectedValueSource } from "./selected-value-source.js";
export interface CsharpTypeResolutionScope {
  nodeQuerySource(node: Node | undefined, sourceFile?: SourceFile): CsharpNodeQuerySource;
  completeNodeQuery(source: CsharpNodeQuerySource): CsharpNodeTypeResolution | undefined;
  typeQuerySource(type: Type | undefined, sourceFile: SourceFile): CsharpTypeQuerySource;
  completeTypeQuery(source: CsharpTypeQuerySource): TargetTypeRef | undefined;
  formStructuralTypeApplication(collection: CsharpCollectedObjectShapeMembers): CsharpStructuralTypeSource;
  resolveStructuralPropertyType(application: CsharpStructuralPropertyApplication): TargetTypeRef | undefined;
  resolveStructuralMemberChildren(application: CsharpStructuralTypeApplication,
    memberIndex: number): CsharpCompletedStructuralMemberChildren | undefined;
  resolveNodeValueWithState(node: Node | undefined, sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState): CsharpSourceCallResult | undefined;
  resolveFormedNodeTypeSource(source: CsharpNodeTypeSource): CsharpSourceCallResult | undefined;
  resolveFormedSemanticTypeSource(source: CsharpSemanticTypeSource): TargetTypeRef | undefined;
  resolveFormedSelectedExpressionResult(source: CsharpSelectedExpressionSource): CsharpSourceCallResult | undefined;
  resolveFormedSelectedValueResult(source: CsharpSelectedValueSource): CsharpSourceCallResult | undefined;
  resolveFormedSourceValueResult(source: CsharpSourceValueSource): CsharpSourceCallResult | undefined;
  resolveArrayLiteralWithState(node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState): CsharpArrayLiteralSelection;
  resolvePointerReturn(
    declaration: Node,
    state: CsharpTypeResolutionState,
  ): CsharpPointerReturnContract | undefined;
  readonly host: CsharpTypePolicyHost;
  readonly sourceUnions: CsharpSourceUnionIndex;
  readonly sourceUnionDefinitions: ReturnType<typeof createCsharpSourceUnionDefinitions>;
  readonly activeNodes: WeakSet<Node>;
  readonly policy: CsharpTypePolicy;
  readonly createCsharpTypePolicy: typeof createCsharpTypePolicy;
  resolveNode(
  node: Node | undefined,
  sourceFile?: SourceFile,
): CsharpNodeTypeResolution | undefined;
  resolveType(
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveStorage(
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined;
  resolveReadStorage(
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined;
  catchVariableStorageCarrier(
  declaration: Node,
): TargetTypeRef | undefined;
  resolveValue(
  node: Node | undefined,
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveSelectedValue(
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveSelectedValueWithState(
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveSelectedType(
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveSelectedResult(
  selectedDeclaration: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveTypedLocationOperationPointee(
  operation: CsharpSourceTypedLocationOperation,
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveTypedLocationOperationPointeeWithState(
  operation: CsharpSourceTypedLocationOperation,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveSourceCallTypeArguments(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined;
  resolveSourceCallParameter(
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
  domain: CsharpSourceCallParameterReadDomain,
): TargetTypeRef | undefined;
  resolveSourceCallParameters(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly import("../../../../target-model/types/model.js").CsharpTargetParameter[] | undefined;
  resolveSourceCallArgumentParameter(
  source: ResolvedSourceCallInfo,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  sourceFile: SourceFile,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined;
  resolveSourceCallResult(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  nativeType: TargetTypeRef | undefined,
): import("../../../../target-model/operations/source-call-results.js").CsharpSourceCallResult | undefined;
  resolveSourceCallResultWithState(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): import("../../../../target-model/operations/source-call-results.js").CsharpSourceCallResult | undefined;
  resolveFormedSourceCallResultWithState(
  source: CsharpSourceCallResultSource,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined;
  withSourceTargetBindings(
  bindings: readonly CsharpSourceTargetTypeBinding[],
): CsharpScopedTypePolicyResult;
  resolveNodeWithState(
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveTupleTypeNode(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  tupleElementIsRest(
  element: Node | undefined,
): boolean;
  resolveSelectedExpressionType(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveMemberAccessTargetType(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  mode: "selected" | "storage",
  selectedType?: Type,
): TargetTypeRef | undefined;
  resolveNonNullExpressionType(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveSelectedReceiverTargetType(
  receiver: {
    readonly expression?: Node;
    readonly type?: Type;
  } | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  completeSelectedReceiver(input: CsharpSelectedReceiverInput): CsharpSelectedReceiverCompletion | undefined;
  resolveFormedSourceOwnedConstructionResult(
  source: CsharpSourceOwnedConstructionSource,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  optionalAccessTargetType(
  type: TargetTypeRef | undefined,
  optionalChain: boolean,
): TargetTypeRef | undefined;
  resolveSelectedDeclarationResult(
  declaration: Node | undefined,
  semanticType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  receiverType?: TargetTypeRef,
  declaredMemberType?: Type,
): TargetTypeRef | undefined;
  resolveProjectEnumMemberTarget(
  declaration: Node | undefined,
): TargetTypeRef | undefined;
  declarationResultTypeNode(
  declaration: Node | undefined,
): Node | undefined;
  resolveFormedTypeReferenceNode(
  source: CsharpTypeReferenceSource,
): TargetTypeRef | undefined;
  resolveFormedCheckerTransformation(
  source: import("./checker-transformation-source.js").CsharpCheckerTransformationSource,
): TargetTypeRef | undefined;
  resolveFormedStandardSourceTypeTransformation(
  source: import("./standard-transformation-source.js").CsharpStandardTypeTransformationSource,
): TargetTypeRef | undefined;
  resolveSignatureParameterListTarget(
  parameters: SourceCallableTypeEvidence["parameters"],
  elements: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  resolveCompositionalSourceTypeAlias(
  typeName: Node,
  typeArguments: readonly TargetTypeRef[],
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  sourceArguments?: readonly (Type | undefined)[],
):
  | { readonly kind: "not-alias" }
  | { readonly kind: "checker-transformed-alias" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected" };
  targetPreservesAuthoredSourcePrimitiveFacts(
  node: Node,
  target: TargetTypeRef,
  queries: SourceFileSemantics,
): boolean;
  collectTargetSourcePrimitiveNames(
  target: TargetTypeRef,
  names: Set<string>,
  visited: Set<string>,
): void;
  resolveSourceValueDeclaration(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined;
  resolveAuthoredAndSelectedSourceType(
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveSourceCallInstantiation(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  expectedTypeParameterNames?: readonly string[],
  callable?: SourceCallableContract,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
      readonly sourceArguments: readonly Type[];
      readonly inference: CsharpSourceCallInference | undefined;
    }
  | undefined;
  resolveSourceCallSelectedType(
  input: CsharpSourceCallContractSource,
  declaration: Node | undefined,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined;
  resolveSourceCallableContractType(
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined;
  completeSourceCallableType(input: CsharpSourceCallableTypeInput): CsharpSourceCallableTypeCompletion | undefined;
  inferSourceCallTargetTypeArguments(
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract | undefined,
  sourceFile: SourceFile,
  parameterNames: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): CsharpSourceCallInference | undefined;
  sourceCallSelectedDeclaration(
  source: ResolvedSourceCallInfo,
): Node | undefined;
  resolveSourceCallReceiverTargetType(
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  completeSourceCallReceiver(input: CsharpSourceCallReceiverInput): CsharpSourceCallReceiverCompletion | undefined;
  resolveSourceCallContract(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection;
  sourceCallableTypeParametersMatch(
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract,
  kind: "declaration" | "value",
): boolean;
  sourceValueDeclaration(
  node: Node,
  referenced: Node | undefined,
): Node | undefined;
  sourceValueDeclarationSyntax(
  declaration: Node,
): {
  readonly type?: Node;
  readonly initializer?: Node;
};
  resolveTypeWithState(
  type: Type | undefined,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveFormedDirectSourceFacts(
  source: CsharpDirectSourceEvidence,
): TargetTypeRef | undefined;
  resolveProviderType(
  subjects: readonly ExtensionFactSubject[],
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  resolveFormedSemanticTypeArguments(
  source: CsharpSemanticTypeArgumentsSource,
): readonly TargetTypeRef[] | undefined;
  resolveSourceProfileType(
  identity: ReturnType<typeof classifyCsharpSourceProfileType>,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  generatorProtocol(
  typeArguments: readonly TargetTypeRef[],
): { readonly yieldType: TargetTypeRef; readonly returnType: TargetTypeRef; readonly nextType: TargetTypeRef } | undefined;
  generatorResultProtocol(
  typeArguments: readonly TargetTypeRef[],
): { readonly yieldType: TargetTypeRef; readonly returnType: TargetTypeRef } | undefined;
  resolveUnionType(
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveCallableType(
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveCallableEvidence(
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveFormedCallableEvidence(
    input: import("./callable-signature-completion.js").CsharpCallableSignatureInput,
  ): TargetTypeRef | undefined;
  resolveSignatureParameterEvidence(
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  use: "callable" | "parameter-list",
): TargetTypeRef | undefined;
  resolveFormedSignatureParameterEvidence(
    input: import("./signature-parameter-source.js").CsharpSignatureParameterInput,
  ): TargetTypeRef | undefined;
  resolveSourceTypeComponentEvidence(
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveFormedSourceTypeComponentEvidence(
    source: import("./type-component-source.js").CsharpSourceTypeComponentSource,
  ): TargetTypeRef | undefined;
  resolveSelectedSymbolType(
  symbol: Symbol,
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveProjectSourceSemanticType(
  type: Type,
  queries: SourceFileSemantics,
  typeArguments: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveProjectSourceType(
  node: Node,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  typeArguments?: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
): TargetTypeRef | undefined;
  projectSourceDeclarationTargetType(
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
  state?: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined;
}
