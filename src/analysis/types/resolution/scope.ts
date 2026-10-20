import type { ExtensionFactSubject, Node, SourceFile, Symbol, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";

import type { CsharpSourceCallContract } from "../../../target-model/records/source-callable-contract.js";

import type { CsharpSourceCallContractSelection } from "./call-contracts.js";

import type { CsharpPointerReturnContract } from "../../../target-model/records/pointer-return.js";
import type { CsharpSourceTypedLocationOperation } from "../../../source/extension/typed-locations.js";
import type { CsharpTypePolicyHost, CsharpScopedTypePolicyResult, CsharpTypePolicy, CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/source-calls.js";
import type { CsharpSourceTargetTypeBinding } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import { type CsharpSourceUnionIndex } from "./source-unions.js";
import { createCsharpSourceUnionDefinitions } from "./union-definitions.js";

import { type CsharpArrayLiteralSelection } from "../../../target-model/records/array-literals.js";

import type { createCsharpTypePolicy } from "./engine.js";
export interface CsharpTypeResolutionScope {
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
): TargetTypeRef | undefined;
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
): TargetTypeRef | undefined;
  resolveSourceCallParameters(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly import("../../../target-model/types/model.js").CsharpTargetParameter[] | undefined;
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
): import("../../../target-model/operations/source-call-results.js").CsharpSourceCallResult | undefined;
  resolveSourceCallResultWithState(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): import("../../../target-model/operations/source-call-results.js").CsharpSourceCallResult | undefined;
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
  resolveProjectThisTargetType(
  node: Node,
): TargetTypeRef | undefined;
  resolveSourceOwnedCallResult(
  source: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["call"]>
  >,
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
  resolveSourceOwnedConstructionResult(
  source: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["call"]>
  >,
  queries: SourceFileSemantics,
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
  resolveTypeReferenceNode(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveCheckerTransformedSourceType(
  authoredRoot: Node,
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveStandardSourceTypeTransformation(
  transformation: NonNullable<
    ReturnType<SourceFileSemantics["types"]["standardTransformation"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node,
  selectedType: Type,
): TargetTypeRef | undefined;
  resolveSignatureParameterListTarget(
  parameters: SourceCallableTypeEvidence["parameters"],
  elements: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  resolveEvidenceNodesToCommonTarget(
  nodes: readonly Node[],
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
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
  callable?: CsharpSourceCallContract,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
    }
  | undefined;
  resolveSourceCallSelectedType(
  source: ResolvedSourceCallInfo,
  declaration: Node | undefined,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined;
  resolveSourceCallableContractType(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined;
  inferSourceCallTargetTypeArguments(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallContract,
  sourceFile: SourceFile,
  parameterNames: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): ReadonlyMap<string, TargetTypeRef> | undefined;
  sourceCallSelectedDeclaration(
  source: ResolvedSourceCallInfo,
): Node | undefined;
  resolveSourceCallReceiverTargetType(
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveSourceCallContract(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection;
  sourceCallableTypeParametersMatch(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallContract,
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
  resolveDirectSourceFacts(
  subjects: readonly ExtensionFactSubject[],
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveProviderType(
  subjects: readonly ExtensionFactSubject[],
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  resolveSemanticTypeArguments(
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): readonly TargetTypeRef[] | undefined;
  resolveSourceProfileType(
  identity: ReturnType<typeof classifyCsharpSourceProfileType>,
  typeArguments: readonly TargetTypeRef[],
  subject: import("@tsonic/target-api/analysis").SourceStorageSubject | undefined,
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
  resolveSignatureParameterEvidence(
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  use: "callable" | "parameter-list",
): TargetTypeRef | undefined;
  resolveSourceTypeComponentEvidence(
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
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
