import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import type {
  SourceDeclarationReference,
  SourceCallableTypeEvidence,
  SourceFileSemantics,
  SourceTypeComponentEvidence,
} from "@tsonic/target-api/source";
import type { CsharpSourceCallableContract } from "../callables/source-callable-contract.js";
import type { CsharpSourceTypedLocationOperation } from "../../operations/typed-locations/source-typed-locations.js";
import type { ResolvedSourceCallInfo, CsharpRecursiveTypeResolver, CsharpTypePolicyHost, CsharpScopedTypePolicyResult, CsharpTypePolicy, CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceTargetTypeBinding } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { classifyCsharpSourceProfileType } from "./source-profile.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";

import {
  resolveNode as resolveNodeImplementation,
  resolveType as resolveTypeImplementation,
  resolveStorage as resolveStorageImplementation,
  resolveReadStorage as resolveReadStorageImplementation,
  catchVariableStorageCarrier as catchVariableStorageCarrierImplementation,
  resolveValue as resolveValueImplementation,
  resolveSelectedValue as resolveSelectedValueImplementation,
  resolveSelectedValueWithState as resolveSelectedValueWithStateImplementation,
  resolveSelectedType as resolveSelectedTypeImplementation,
  resolveSelectedResult as resolveSelectedResultImplementation,
  resolveTypedLocationOperationPointee as resolveTypedLocationOperationPointeeImplementation,
  resolveTypedLocationOperationPointeeWithState as resolveTypedLocationOperationPointeeWithStateImplementation,
  resolveSourceCallTypeArguments as resolveSourceCallTypeArgumentsImplementation,
  resolveSourceCallParameter as resolveSourceCallParameterImplementation,
  resolveSourceCallArgumentParameter as resolveSourceCallArgumentParameterImplementation,
  resolveSourceCallResult as resolveSourceCallResultImplementation,
  resolveSourceCallResultWithState as resolveSourceCallResultWithStateImplementation,
  resolveDeclaredNamedType as resolveDeclaredNamedTypeImplementation,
  withSourceTargetBindings as withSourceTargetBindingsImplementation,
} from "./public-api.js";
import {
  resolveNodeWithState as resolveNodeWithStateImplementation,
  resolveTupleTypeNode as resolveTupleTypeNodeImplementation,
  tupleElementIsRest as tupleElementIsRestImplementation,
} from "./nodes.js";
import {
  resolveSelectedExpressionType as resolveSelectedExpressionTypeImplementation,
  resolvePropertyAccessTargetType as resolvePropertyAccessTargetTypeImplementation,
  resolveNonNullExpressionType as resolveNonNullExpressionTypeImplementation,
  resolveProjectThisTargetType as resolveProjectThisTargetTypeImplementation,
  resolveSourceOwnedCallResult as resolveSourceOwnedCallResultImplementation,
  resolveSelectedReceiverTargetType as resolveSelectedReceiverTargetTypeImplementation,
  resolveSourceOwnedConstructionResult as resolveSourceOwnedConstructionResultImplementation,
  optionalAccessTargetType as optionalAccessTargetTypeImplementation,
} from "./expressions.js";
import {
  resolveSelectedDeclarationResult as resolveSelectedDeclarationResultImplementation,
  resolveProjectEnumMemberTarget as resolveProjectEnumMemberTargetImplementation,
  declarationResultTypeNode as declarationResultTypeNodeImplementation,
} from "./declarations.js";
import {
  resolveTypeReferenceNode as resolveTypeReferenceNodeImplementation,
  resolveCheckerTransformedSourceType as resolveCheckerTransformedSourceTypeImplementation,
  resolveStandardSourceTypeTransformation as resolveStandardSourceTypeTransformationImplementation,
  resolveSignatureParameterListTarget as resolveSignatureParameterListTargetImplementation,
  resolveEvidenceNodesToCommonTarget as resolveEvidenceNodesToCommonTargetImplementation,
  resolveCompositionalSourceTypeAlias as resolveCompositionalSourceTypeAliasImplementation,
  targetPreservesAuthoredSourcePrimitiveFacts as targetPreservesAuthoredSourcePrimitiveFactsImplementation,
  collectTargetSourcePrimitiveNames as collectTargetSourcePrimitiveNamesImplementation,
  resolveSourceValueDeclaration as resolveSourceValueDeclarationImplementation,
} from "./source-references.js";
import {
  resolveAuthoredAndSelectedSourceType as resolveAuthoredAndSelectedSourceTypeImplementation,
  resolveSourceCallInstantiation as resolveSourceCallInstantiationImplementation,
  resolveSourceCallSelectedType as resolveSourceCallSelectedTypeImplementation,
  resolveSourceCallableContractType as resolveSourceCallableContractTypeImplementation,
  inferSourceCallTargetTypeArguments as inferSourceCallTargetTypeArgumentsImplementation,
  sourceCallSelectedDeclaration as sourceCallSelectedDeclarationImplementation,
  resolveSourceCallReceiverTargetType as resolveSourceCallReceiverTargetTypeImplementation,
  sourceCallCalleeDelegateSignature as sourceCallCalleeDelegateSignatureImplementation,
  sourceCallableTypeParametersMatch as sourceCallableTypeParametersMatchImplementation,
  sourceValueDeclaration as sourceValueDeclarationImplementation,
  sourceValueDeclarationSyntax as sourceValueDeclarationSyntaxImplementation,
} from "./calls.js";
import {
  resolveTypeWithState as resolveTypeWithStateImplementation,
  resolveDirectSourceFacts as resolveDirectSourceFactsImplementation,
  resolveProviderType as resolveProviderTypeImplementation,
  resolveSemanticTypeArguments as resolveSemanticTypeArgumentsImplementation,
} from "./semantic-types.js";
import {
  resolveSourceProfileType as resolveSourceProfileTypeImplementation,
  generatorProtocol as generatorProtocolImplementation,
  generatorResultProtocol as generatorResultProtocolImplementation,
  resolveUnionType as resolveUnionTypeImplementation,
  resolveCallableType as resolveCallableTypeImplementation,
  resolveCallableEvidence as resolveCallableEvidenceImplementation,
  resolveSignatureParameterEvidence as resolveSignatureParameterEvidenceImplementation,
  resolveSourceTypeComponentEvidence as resolveSourceTypeComponentEvidenceImplementation,
} from "./source-profiles.js";
import {
  resolveSelectedSymbolType as resolveSelectedSymbolTypeImplementation,
  resolveProjectSourceSemanticType as resolveProjectSourceSemanticTypeImplementation,
  resolveProjectSourceType as resolveProjectSourceTypeImplementation,
  projectSourceDeclarationTargetType as projectSourceDeclarationTargetTypeImplementation,
} from "./project-types.js";
import {
  createCsharpTypeResolutionQueryCache,
} from "./query-cache.js";

type DropScope<Arguments extends readonly unknown[]> =
  Arguments extends readonly [unknown, ...infer Rest] ? Rest : never;

export interface CsharpTypeResolutionScope {
  readonly host: CsharpTypePolicyHost;
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
  resolveSourceCallArgumentParameter(
  source: ResolvedSourceCallInfo,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveSourceCallResult(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): TargetTypeRef | undefined;
  resolveSourceCallResultWithState(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  resolveDeclaredNamedType(
  reference: SourceDeclarationReference,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
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
  resolvePropertyAccessTargetType(
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  mode: "selected" | "storage",
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
  state: CsharpTypeResolutionState,
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
  callable?: CsharpSourceCallableContract,
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
): TargetTypeRef | undefined;
  resolveSourceCallableContractType(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  inferSourceCallTargetTypeArguments(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
  sourceFile: SourceFile,
  parameterNames: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
): ReadonlyMap<string, TargetTypeRef> | undefined;
  sourceCallSelectedDeclaration(
  source: ResolvedSourceCallInfo,
): Node | undefined;
  resolveSourceCallReceiverTargetType(
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined;
  sourceCallCalleeDelegateSignature(
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): ReturnType<typeof getCsharpDelegateSignature>;
  sourceCallableTypeParametersMatch(
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
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
): TargetTypeRef | undefined;
  resolveProjectSourceType(
  node: Node,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  typeArguments?: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
  projectSourceDeclarationTargetType(
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined;
}

export interface CsharpTypeResolutionServices {
  readonly policy: CsharpTypePolicy;
  readonly recursive: CsharpRecursiveTypeResolver;
}

export function createCsharpTypeResolutionServices(
  host: CsharpTypePolicyHost,
): CsharpTypeResolutionServices {
  let scope!: CsharpTypeResolutionScope;
  const queryCache = createCsharpTypeResolutionQueryCache();
  const methods = {
    resolveNode: (
      node: Node | undefined,
      sourceFile?: SourceFile,
    ) => queryCache.resolveNode(
      node,
      sourceFile,
      () => resolveNodeImplementation(scope, node, sourceFile),
    ),
    resolveType: (
      type: Type | undefined,
      sourceFile: SourceFile,
    ) => queryCache.resolveType(
      type,
      sourceFile,
      () => resolveTypeImplementation(scope, type, sourceFile),
    ),
    resolveStorage: (
      node: Node | undefined,
      sourceFile?: SourceFile,
    ) => queryCache.resolveStorage(
      node,
      sourceFile,
      () => resolveStorageImplementation(scope, node, sourceFile),
    ),
    resolveReadStorage: (
      node: Node | undefined,
      sourceFile?: SourceFile,
    ) => queryCache.resolveReadStorage(
      node,
      sourceFile,
      () => resolveReadStorageImplementation(scope, node, sourceFile),
    ),
    catchVariableStorageCarrier: (...args: DropScope<Parameters<typeof catchVariableStorageCarrierImplementation>>) =>
      catchVariableStorageCarrierImplementation(scope, ...args),
    resolveValue: (...args: DropScope<Parameters<typeof resolveValueImplementation>>) =>
      resolveValueImplementation(scope, ...args),
    resolveSelectedValue: (...args: DropScope<Parameters<typeof resolveSelectedValueImplementation>>) =>
      resolveSelectedValueImplementation(scope, ...args),
    resolveSelectedValueWithState: (...args: DropScope<Parameters<typeof resolveSelectedValueWithStateImplementation>>) =>
      resolveSelectedValueWithStateImplementation(scope, ...args),
    resolveSelectedType: (...args: DropScope<Parameters<typeof resolveSelectedTypeImplementation>>) =>
      resolveSelectedTypeImplementation(scope, ...args),
    resolveSelectedResult: (...args: DropScope<Parameters<typeof resolveSelectedResultImplementation>>) =>
      resolveSelectedResultImplementation(scope, ...args),
    resolveTypedLocationOperationPointee: (...args: DropScope<Parameters<typeof resolveTypedLocationOperationPointeeImplementation>>) =>
      resolveTypedLocationOperationPointeeImplementation(scope, ...args),
    resolveTypedLocationOperationPointeeWithState: (...args: DropScope<Parameters<typeof resolveTypedLocationOperationPointeeWithStateImplementation>>) =>
      resolveTypedLocationOperationPointeeWithStateImplementation(scope, ...args),
    resolveSourceCallTypeArguments: (...args: DropScope<Parameters<typeof resolveSourceCallTypeArgumentsImplementation>>) =>
      resolveSourceCallTypeArgumentsImplementation(scope, ...args),
    resolveSourceCallParameter: (...args: DropScope<Parameters<typeof resolveSourceCallParameterImplementation>>) =>
      resolveSourceCallParameterImplementation(scope, ...args),
    resolveSourceCallArgumentParameter: (...args: DropScope<Parameters<typeof resolveSourceCallArgumentParameterImplementation>>) =>
      resolveSourceCallArgumentParameterImplementation(scope, ...args),
    resolveSourceCallResult: (...args: DropScope<Parameters<typeof resolveSourceCallResultImplementation>>) =>
      resolveSourceCallResultImplementation(scope, ...args),
    resolveSourceCallResultWithState: (...args: DropScope<Parameters<typeof resolveSourceCallResultWithStateImplementation>>) =>
      resolveSourceCallResultWithStateImplementation(scope, ...args),
    resolveDeclaredNamedType: (...args: DropScope<Parameters<typeof resolveDeclaredNamedTypeImplementation>>) =>
      resolveDeclaredNamedTypeImplementation(scope, ...args),
    withSourceTargetBindings: (...args: DropScope<Parameters<typeof withSourceTargetBindingsImplementation>>) =>
      withSourceTargetBindingsImplementation(scope, ...args),
    resolveNodeWithState: (
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      state: CsharpTypeResolutionState,
    ) => {
      if (node === undefined || scope.activeNodes.has(node)) {
        return undefined;
      }
      scope.activeNodes.add(node);
      try {
        return resolveNodeWithStateImplementation(
          scope,
          node,
          sourceFile,
          state,
        );
      } finally {
        scope.activeNodes.delete(node);
      }
    },
    resolveTupleTypeNode: (...args: DropScope<Parameters<typeof resolveTupleTypeNodeImplementation>>) =>
      resolveTupleTypeNodeImplementation(scope, ...args),
    tupleElementIsRest: (...args: DropScope<Parameters<typeof tupleElementIsRestImplementation>>) =>
      tupleElementIsRestImplementation(scope, ...args),
    resolveSelectedExpressionType: (...args: DropScope<Parameters<typeof resolveSelectedExpressionTypeImplementation>>) =>
      resolveSelectedExpressionTypeImplementation(scope, ...args),
    resolvePropertyAccessTargetType: (...args: DropScope<Parameters<typeof resolvePropertyAccessTargetTypeImplementation>>) =>
      resolvePropertyAccessTargetTypeImplementation(scope, ...args),
    resolveNonNullExpressionType: (...args: DropScope<Parameters<typeof resolveNonNullExpressionTypeImplementation>>) =>
      resolveNonNullExpressionTypeImplementation(scope, ...args),
    resolveProjectThisTargetType: (...args: DropScope<Parameters<typeof resolveProjectThisTargetTypeImplementation>>) =>
      resolveProjectThisTargetTypeImplementation(scope, ...args),
    resolveSourceOwnedCallResult: (...args: DropScope<Parameters<typeof resolveSourceOwnedCallResultImplementation>>) =>
      resolveSourceOwnedCallResultImplementation(scope, ...args),
    resolveSelectedReceiverTargetType: (...args: DropScope<Parameters<typeof resolveSelectedReceiverTargetTypeImplementation>>) =>
      resolveSelectedReceiverTargetTypeImplementation(scope, ...args),
    resolveSourceOwnedConstructionResult: (...args: DropScope<Parameters<typeof resolveSourceOwnedConstructionResultImplementation>>) =>
      resolveSourceOwnedConstructionResultImplementation(scope, ...args),
    optionalAccessTargetType: (...args: DropScope<Parameters<typeof optionalAccessTargetTypeImplementation>>) =>
      optionalAccessTargetTypeImplementation(scope, ...args),
    resolveSelectedDeclarationResult: (...args: DropScope<Parameters<typeof resolveSelectedDeclarationResultImplementation>>) =>
      resolveSelectedDeclarationResultImplementation(scope, ...args),
    resolveProjectEnumMemberTarget: (...args: DropScope<Parameters<typeof resolveProjectEnumMemberTargetImplementation>>) =>
      resolveProjectEnumMemberTargetImplementation(scope, ...args),
    declarationResultTypeNode: (...args: DropScope<Parameters<typeof declarationResultTypeNodeImplementation>>) =>
      declarationResultTypeNodeImplementation(scope, ...args),
    resolveTypeReferenceNode: (...args: DropScope<Parameters<typeof resolveTypeReferenceNodeImplementation>>) =>
      resolveTypeReferenceNodeImplementation(scope, ...args),
    resolveCheckerTransformedSourceType: (...args: DropScope<Parameters<typeof resolveCheckerTransformedSourceTypeImplementation>>) =>
      resolveCheckerTransformedSourceTypeImplementation(scope, ...args),
    resolveStandardSourceTypeTransformation: (...args: DropScope<Parameters<typeof resolveStandardSourceTypeTransformationImplementation>>) =>
      resolveStandardSourceTypeTransformationImplementation(scope, ...args),
    resolveSignatureParameterListTarget: (...args: DropScope<Parameters<typeof resolveSignatureParameterListTargetImplementation>>) =>
      resolveSignatureParameterListTargetImplementation(scope, ...args),
    resolveEvidenceNodesToCommonTarget: (...args: DropScope<Parameters<typeof resolveEvidenceNodesToCommonTargetImplementation>>) =>
      resolveEvidenceNodesToCommonTargetImplementation(scope, ...args),
    resolveCompositionalSourceTypeAlias: (...args: DropScope<Parameters<typeof resolveCompositionalSourceTypeAliasImplementation>>) =>
      resolveCompositionalSourceTypeAliasImplementation(scope, ...args),
    targetPreservesAuthoredSourcePrimitiveFacts: (...args: DropScope<Parameters<typeof targetPreservesAuthoredSourcePrimitiveFactsImplementation>>) =>
      targetPreservesAuthoredSourcePrimitiveFactsImplementation(scope, ...args),
    collectTargetSourcePrimitiveNames: (...args: DropScope<Parameters<typeof collectTargetSourcePrimitiveNamesImplementation>>) =>
      collectTargetSourcePrimitiveNamesImplementation(scope, ...args),
    resolveSourceValueDeclaration: (...args: DropScope<Parameters<typeof resolveSourceValueDeclarationImplementation>>) =>
      resolveSourceValueDeclarationImplementation(scope, ...args),
    resolveAuthoredAndSelectedSourceType: (...args: DropScope<Parameters<typeof resolveAuthoredAndSelectedSourceTypeImplementation>>) =>
      resolveAuthoredAndSelectedSourceTypeImplementation(scope, ...args),
    resolveSourceCallInstantiation: (...args: DropScope<Parameters<typeof resolveSourceCallInstantiationImplementation>>) =>
      resolveSourceCallInstantiationImplementation(scope, ...args),
    resolveSourceCallSelectedType: (...args: DropScope<Parameters<typeof resolveSourceCallSelectedTypeImplementation>>) =>
      resolveSourceCallSelectedTypeImplementation(scope, ...args),
    resolveSourceCallableContractType: (...args: DropScope<Parameters<typeof resolveSourceCallableContractTypeImplementation>>) =>
      resolveSourceCallableContractTypeImplementation(scope, ...args),
    inferSourceCallTargetTypeArguments: (...args: DropScope<Parameters<typeof inferSourceCallTargetTypeArgumentsImplementation>>) =>
      inferSourceCallTargetTypeArgumentsImplementation(scope, ...args),
    sourceCallSelectedDeclaration: (...args: DropScope<Parameters<typeof sourceCallSelectedDeclarationImplementation>>) =>
      sourceCallSelectedDeclarationImplementation(scope, ...args),
    resolveSourceCallReceiverTargetType: (...args: DropScope<Parameters<typeof resolveSourceCallReceiverTargetTypeImplementation>>) =>
      resolveSourceCallReceiverTargetTypeImplementation(scope, ...args),
    sourceCallCalleeDelegateSignature: (...args: DropScope<Parameters<typeof sourceCallCalleeDelegateSignatureImplementation>>) =>
      sourceCallCalleeDelegateSignatureImplementation(scope, ...args),
    sourceCallableTypeParametersMatch: (...args: DropScope<Parameters<typeof sourceCallableTypeParametersMatchImplementation>>) =>
      sourceCallableTypeParametersMatchImplementation(scope, ...args),
    sourceValueDeclaration: (...args: DropScope<Parameters<typeof sourceValueDeclarationImplementation>>) =>
      sourceValueDeclarationImplementation(scope, ...args),
    sourceValueDeclarationSyntax: (...args: DropScope<Parameters<typeof sourceValueDeclarationSyntaxImplementation>>) =>
      sourceValueDeclarationSyntaxImplementation(scope, ...args),
    resolveTypeWithState: (...args: DropScope<Parameters<typeof resolveTypeWithStateImplementation>>) =>
      resolveTypeWithStateImplementation(scope, ...args),
    resolveDirectSourceFacts: (...args: DropScope<Parameters<typeof resolveDirectSourceFactsImplementation>>) =>
      resolveDirectSourceFactsImplementation(scope, ...args),
    resolveProviderType: (...args: DropScope<Parameters<typeof resolveProviderTypeImplementation>>) =>
      resolveProviderTypeImplementation(scope, ...args),
    resolveSemanticTypeArguments: (...args: DropScope<Parameters<typeof resolveSemanticTypeArgumentsImplementation>>) =>
      resolveSemanticTypeArgumentsImplementation(scope, ...args),
    resolveSourceProfileType: (...args: DropScope<Parameters<typeof resolveSourceProfileTypeImplementation>>) =>
      resolveSourceProfileTypeImplementation(scope, ...args),
    generatorProtocol: (...args: DropScope<Parameters<typeof generatorProtocolImplementation>>) =>
      generatorProtocolImplementation(scope, ...args),
    generatorResultProtocol: (...args: DropScope<Parameters<typeof generatorResultProtocolImplementation>>) =>
      generatorResultProtocolImplementation(scope, ...args),
    resolveUnionType: (...args: DropScope<Parameters<typeof resolveUnionTypeImplementation>>) =>
      resolveUnionTypeImplementation(scope, ...args),
    resolveCallableType: (...args: DropScope<Parameters<typeof resolveCallableTypeImplementation>>) =>
      resolveCallableTypeImplementation(scope, ...args),
    resolveCallableEvidence: (...args: DropScope<Parameters<typeof resolveCallableEvidenceImplementation>>) =>
      resolveCallableEvidenceImplementation(scope, ...args),
    resolveSignatureParameterEvidence: (...args: DropScope<Parameters<typeof resolveSignatureParameterEvidenceImplementation>>) =>
      resolveSignatureParameterEvidenceImplementation(scope, ...args),
    resolveSourceTypeComponentEvidence: (...args: DropScope<Parameters<typeof resolveSourceTypeComponentEvidenceImplementation>>) =>
      resolveSourceTypeComponentEvidenceImplementation(scope, ...args),
    resolveSelectedSymbolType: (...args: DropScope<Parameters<typeof resolveSelectedSymbolTypeImplementation>>) =>
      resolveSelectedSymbolTypeImplementation(scope, ...args),
    resolveProjectSourceSemanticType: (...args: DropScope<Parameters<typeof resolveProjectSourceSemanticTypeImplementation>>) =>
      resolveProjectSourceSemanticTypeImplementation(scope, ...args),
    resolveProjectSourceType: (...args: DropScope<Parameters<typeof resolveProjectSourceTypeImplementation>>) =>
      resolveProjectSourceTypeImplementation(scope, ...args),
    projectSourceDeclarationTargetType: (...args: DropScope<Parameters<typeof projectSourceDeclarationTargetTypeImplementation>>) =>
      projectSourceDeclarationTargetTypeImplementation(scope, ...args),
  };
  const policy: CsharpTypePolicy = Object.freeze({
    resolveNode: methods.resolveNode,
    resolveStorage: methods.resolveStorage,
    resolveReadStorage: methods.resolveReadStorage,
    resolveType: methods.resolveType,
    resolveValue: methods.resolveValue,
    resolveSelectedValue: methods.resolveSelectedValue,
    resolveSelectedType: methods.resolveSelectedType,
    resolveSelectedResult: methods.resolveSelectedResult,
    resolveTypedLocationOperationPointee: methods.resolveTypedLocationOperationPointee,
    resolveSourceCallTypeArguments: methods.resolveSourceCallTypeArguments,
    resolveSourceCallParameter: methods.resolveSourceCallParameter,
    resolveSourceCallArgumentParameter: methods.resolveSourceCallArgumentParameter,
    resolveSourceCallResult: methods.resolveSourceCallResult,
    resolveDeclaredNamedType: methods.resolveDeclaredNamedType,
    withSourceTargetBindings: methods.withSourceTargetBindings,
  } satisfies CsharpTypePolicy);
  scope = Object.freeze({
    host,
    activeNodes: new WeakSet<Node>(),
    policy,
    createCsharpTypePolicy,
    ...methods,
  });
  const recursive: CsharpRecursiveTypeResolver = Object.freeze({
    resolveNode: methods.resolveNodeWithState,
    resolveType: methods.resolveTypeWithState,
    resolveSelectedType(
      authoredTypeNode: Node | undefined,
      selectedType: Type | undefined,
      selectedSourceFile: SourceFile,
      state: CsharpTypeResolutionState,
    ) {
      const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
        selectedSourceFile;
      return methods.resolveAuthoredAndSelectedSourceType(
        authoredTypeNode,
        authoredSourceFile,
        selectedType,
        selectedSourceFile,
        state,
      );
    },
  });
  return Object.freeze({ policy, recursive });
}

export function createCsharpTypePolicy(
  host: CsharpTypePolicyHost,
): CsharpTypePolicy {
  return createCsharpTypeResolutionServices(host).policy;
}
