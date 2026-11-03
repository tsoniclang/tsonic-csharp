import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { sourceNodeIsNativeUnreachable } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

import { formCsharpSourceCallContractSource, resolveFormedSourceCallContract,
  resolveSourceCallContract as resolveSourceCallContractImplementation } from "./call-contracts.js";

import { resolveCsharpPointerReturnContract } from "../../../callables/ownership/pointer-return.js";

import type { CsharpRecursiveTypeResolver, CsharpTypePolicyHost, CsharpTypePolicy, CsharpTypeResolutionState } from "./model.js";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";

import { createCsharpSourceUnionIndex } from "./source-unions.js";
import { createCsharpSourceUnionDefinitions } from "./union-definitions.js";
import { createCsharpFixedArrayTypeQuery } from "./source-markers.js";
import { selectCsharpNativeFlowMembers, selectCsharpNativeFlowTypeMembers, selectCsharpNativeGuardResult } from "./native-flow-refinement.js";
import { resolveCsharpArrayLiteralSelection } from "./array-literals.js";

import { resolveCsharpInstanceType } from "./instance-tests.js";
import type { SourceNativeValueGuard } from "@tsonic/target-api/source";

import { resolveSourceCallTypeArguments as resolveSourceCallTypeArgumentsImplementation, resolveSourceCallParameter as resolveSourceCallParameterImplementation, resolveSourceCallParameters as resolveSourceCallParametersImplementation, resolveSourceCallArgumentParameter as resolveSourceCallArgumentParameterImplementation, resolveSourceCallResult as resolveSourceCallResultImplementation, resolveSourceCallResultWithState as resolveSourceCallResultWithStateImplementation,
  resolveFormedCsharpSourceCallResultWithState, completeCsharpSourceCallArgumentParameter } from "./call-api.js";
import { resolveNode as resolveNodeImplementation, resolveType as resolveTypeImplementation, resolveStorage as resolveStorageImplementation, resolveReadStorage as resolveReadStorageImplementation, catchVariableStorageCarrier as catchVariableStorageCarrierImplementation, resolveValue as resolveValueImplementation, resolveSelectedValue as resolveSelectedValueImplementation, resolveSelectedValueWithState as resolveSelectedValueWithStateImplementation, resolveSelectedType as resolveSelectedTypeImplementation, resolveSelectedResult as resolveSelectedResultImplementation, resolveTypedLocationOperationPointee as resolveTypedLocationOperationPointeeImplementation, resolveTypedLocationOperationPointeeWithState as resolveTypedLocationOperationPointeeWithStateImplementation, withSourceTargetBindings as withSourceTargetBindingsImplementation } from "./public-api.js";
import { resolveFormedCsharpNodeTypeSource, resolveTupleTypeNode as resolveTupleTypeNodeImplementation, tupleElementIsRest as tupleElementIsRestImplementation } from "./nodes.js";
import { csharpSourceValueResult } from "./call-results.js";
import { resolveSelectedValueResultWithState, resolveFormedCsharpNodeQuerySource,
  resolveFormedCsharpTypeQuerySource } from "./public-api.js";
import { resolveFormedCsharpSelectedExpressionResult } from "./expressions.js";
import { resolveSourceValueResult } from "./source-references.js";
import { optionalAccessTargetType as optionalAccessTargetTypeImplementation } from "../../../../policy/types/storage/optional-access.js";
import { resolveSelectedExpressionType as resolveSelectedExpressionTypeImplementation, resolveMemberAccessTargetType as resolveMemberAccessTargetTypeImplementation, resolveNonNullExpressionType as resolveNonNullExpressionTypeImplementation, resolveProjectThisTargetType as resolveProjectThisTargetTypeImplementation, resolveSelectedReceiverTargetType as resolveSelectedReceiverTargetTypeImplementation, resolveFormedCsharpSourceOwnedConstructionResult } from "./expressions.js";
import { resolveSelectedDeclarationResult as resolveSelectedDeclarationResultImplementation, resolveProjectEnumMemberTarget as resolveProjectEnumMemberTargetImplementation, declarationResultTypeNode as declarationResultTypeNodeImplementation } from "./declarations.js";
import { resolveFormedCsharpTypeReferenceNode as resolveTypeReferenceNodeImplementation, resolveCheckerTransformedSourceType as resolveCheckerTransformedSourceTypeImplementation, resolveStandardSourceTypeTransformation as resolveStandardSourceTypeTransformationImplementation, resolveSignatureParameterListTarget as resolveSignatureParameterListTargetImplementation, resolveEvidenceNodesToCommonTarget as resolveEvidenceNodesToCommonTargetImplementation, resolveCompositionalSourceTypeAlias as resolveCompositionalSourceTypeAliasImplementation, targetPreservesAuthoredSourcePrimitiveFacts as targetPreservesAuthoredSourcePrimitiveFactsImplementation, collectTargetSourcePrimitiveNames as collectTargetSourcePrimitiveNamesImplementation, resolveSourceValueDeclaration as resolveSourceValueDeclarationImplementation } from "./source-references.js";
import { resolveSourceCallInstantiation as resolveSourceCallInstantiationImplementation, resolveSourceCallSelectedType as resolveSourceCallSelectedTypeImplementation, resolveSourceCallableContractType as resolveSourceCallableContractTypeImplementation, inferSourceCallTargetTypeArguments as inferSourceCallTargetTypeArgumentsImplementation, sourceCallSelectedDeclaration as sourceCallSelectedDeclarationImplementation, resolveSourceCallReceiverTargetType as resolveSourceCallReceiverTargetTypeImplementation, sourceCallableTypeParametersMatch as sourceCallableTypeParametersMatchImplementation, sourceValueDeclaration as sourceValueDeclarationImplementation, sourceValueDeclarationSyntax as sourceValueDeclarationSyntaxImplementation } from "./calls.js";
import { completeCsharpSourceCallableType, completeCsharpSourceCallReceiver } from "./calls.js";
import { completeCsharpSourceCallableTypeSource } from "./call-type-source.js";
import { completeCsharpSelectedReceiver } from "./receiver-completions.js";
import { resolveAuthoredAndSelectedSourceType as resolveAuthoredAndSelectedSourceTypeImplementation,
  formCsharpAuthoredTypeSelectionSource, bindCsharpAuthoredTypeSelectionSource,
  resolveFormedAuthoredAndSelectedSourceType, type CsharpAuthoredTypeSelectionEvidence } from "./selected-values.js";
import { resolveFormedCsharpSemanticTypeSource, resolveProviderType as resolveProviderTypeImplementation, resolveFormedCsharpSemanticTypeArguments } from "./semantic-types.js";
import { resolveSourceProfileType as resolveSourceProfileTypeImplementation, resolveUnionType as resolveUnionTypeImplementation, resolveCallableType as resolveCallableTypeImplementation, resolveCallableEvidence as resolveCallableEvidenceImplementation, resolveSignatureParameterEvidence as resolveSignatureParameterEvidenceImplementation, resolveSourceTypeComponentEvidence as resolveSourceTypeComponentEvidenceImplementation } from "./source-profiles.js";
import { generatorProtocol as generatorProtocolImplementation, generatorResultProtocol as generatorResultProtocolImplementation } from "../../../../policy/operations/source-profiles/type-carriers.js";
import { resolveSelectedSymbolType as resolveSelectedSymbolTypeImplementation, resolveProjectSourceSemanticType as resolveProjectSourceSemanticTypeImplementation, resolveProjectSourceType as resolveProjectSourceTypeImplementation, projectSourceDeclarationTargetType as projectSourceDeclarationTargetTypeImplementation } from "./project-types.js";
import { formCsharpProjectSemanticSource, resolveFormedCsharpProjectSemanticType,
  formCsharpProjectReferenceSource, resolveFormedCsharpProjectReference,
  formCsharpSelectedSymbolSource, resolveFormedCsharpSelectedSymbolType } from "./project-types.js";
import { createCsharpTypeResolutionQueryCache } from "./query-cache.js";
import { bindCsharpStructuralTypeApplication, formCsharpStructuralTypeApplication,
  formCsharpStructuralTypeCapture, bindCsharpStructuralTypeCapture,
  resolveCsharpStructuralMemberChildren, resolveCsharpStructuralPropertyType } from "./structural-applications.js";
import { formCsharpNodeQuerySource, formCsharpTypeQuerySource,
  formCsharpNodeTypeSource, formCsharpSemanticTypeSource,
  type CsharpNodeQuerySource, type CsharpTypeQuerySource,
  type CsharpNodeTypeSource, type CsharpSemanticTypeSource } from "./root-sources.js";
import { formCsharpSourceDeclarationArguments, resolveFormedCsharpSourceDeclarationArguments,
  formCsharpSourceTypeArguments, bindCsharpSourceTypeArgumentsSource, resolveFormedCsharpSourceTypeArguments } from "./generic-arguments.js";
import { formCsharpSemanticTypeArgumentsSource } from "./semantic-argument-source.js";
import { formCsharpDirectSourceEvidence, completeCsharpDirectSourceEvidence,
  resolveFormedCsharpDirectSourceFacts } from "./direct-source-evidence.js";
import { resolveCsharpPointerStoragePointee } from "./pointer-storage.js";
import { formCsharpLiteralCreationContextSource, resolveFormedCsharpLiteralCreationContext } from "./literal-creation-context.js";
import { completeCsharpSourceCallArgumentParameterSource } from "./call-argument-source.js";
import { formCsharpSourceTypeComponentSource, resolveFormedCsharpSourceTypeComponent } from "./type-component-source.js";

import type { CsharpTypeResolutionScope } from "./scope.js";
type DropScope<Arguments extends readonly unknown[]> =
  Arguments extends readonly [unknown, ...infer Rest] ? Rest : never;

export interface CsharpTypeResolutionServices {
  readonly sourceTypeArguments: typeof formCsharpSourceTypeArguments;
  readonly bindSourceTypeArguments: typeof bindCsharpSourceTypeArgumentsSource;
  readonly completeSourceTypeArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceTypeArguments>>) =>
    ReturnType<typeof resolveFormedCsharpSourceTypeArguments>;
  readonly sourceTypeComponentSource: (...args: DropScope<Parameters<typeof formCsharpSourceTypeComponentSource>>) =>
    ReturnType<typeof formCsharpSourceTypeComponentSource>;
  readonly completeSourceTypeComponent: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceTypeComponent>>) =>
    ReturnType<typeof resolveFormedCsharpSourceTypeComponent>;
  readonly authoredSelectionSource: (...args: DropScope<Parameters<typeof formCsharpAuthoredTypeSelectionSource>>) =>
    ReturnType<typeof formCsharpAuthoredTypeSelectionSource>;
  readonly bindAuthoredSelection: typeof bindCsharpAuthoredTypeSelectionSource;
  readonly structuralTypeCapture: (...args: DropScope<Parameters<typeof formCsharpStructuralTypeCapture>>) =>
    ReturnType<typeof formCsharpStructuralTypeCapture>;
  readonly bindStructuralTypeCapture: typeof bindCsharpStructuralTypeCapture;
  readonly directFactsSource: (...args: DropScope<Parameters<typeof formCsharpDirectSourceEvidence>>) =>
    ReturnType<typeof formCsharpDirectSourceEvidence>;
  readonly completeDirectFacts: typeof completeCsharpDirectSourceEvidence;
  readonly semanticTypeArguments: (...args: DropScope<Parameters<typeof formCsharpSemanticTypeArgumentsSource>>) =>
    ReturnType<typeof formCsharpSemanticTypeArgumentsSource>;
  readonly completeSemanticTypeArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSemanticTypeArguments>>) =>
    ReturnType<typeof resolveFormedCsharpSemanticTypeArguments>;
  readonly sourceDeclarationArguments: (...args: DropScope<Parameters<typeof formCsharpSourceDeclarationArguments>>) =>
    ReturnType<typeof formCsharpSourceDeclarationArguments>;
  readonly completeSourceDeclarationArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceDeclarationArguments>>) =>
    ReturnType<typeof resolveFormedCsharpSourceDeclarationArguments>;
  readonly nodeQuerySource: (...args: DropScope<Parameters<typeof formCsharpNodeQuerySource>>) => CsharpNodeQuerySource;
  readonly completeNodeQuery: (source: CsharpNodeQuerySource) => ReturnType<typeof resolveFormedCsharpNodeQuerySource>;
  readonly typeQuerySource: (...args: DropScope<Parameters<typeof formCsharpTypeQuerySource>>) => CsharpTypeQuerySource;
  readonly completeTypeQuery: (source: CsharpTypeQuerySource) => TargetTypeRef | undefined;
  readonly nodeRootSource: (...args: DropScope<Parameters<typeof formCsharpNodeTypeSource>>) => CsharpNodeTypeSource;
  readonly completeNodeRoot: (source: CsharpNodeTypeSource) => ReturnType<typeof resolveFormedCsharpNodeTypeSource>;
  readonly semanticRootSource: (...args: DropScope<Parameters<typeof formCsharpSemanticTypeSource>>) => CsharpSemanticTypeSource;
  readonly completeSemanticRoot: (source: CsharpSemanticTypeSource) => TargetTypeRef | undefined;
  readonly callContractSource: (...args: DropScope<Parameters<typeof formCsharpSourceCallContractSource>>) =>
    ReturnType<typeof formCsharpSourceCallContractSource>;
  readonly completeCallContract: (...args: DropScope<Parameters<typeof resolveFormedSourceCallContract>>) =>
    ReturnType<typeof resolveFormedSourceCallContract>;
  readonly completeCallArgumentParameter: (...args: DropScope<Parameters<typeof completeCsharpSourceCallArgumentParameter>>) =>
    ReturnType<typeof completeCsharpSourceCallArgumentParameter>;
  readonly completeCallArgumentParameterSource: typeof completeCsharpSourceCallArgumentParameterSource;
  readonly completeSourceCallableType: (...args: DropScope<Parameters<typeof completeCsharpSourceCallableType>>) =>
    ReturnType<typeof completeCsharpSourceCallableType>;
  readonly completeSourceCallableTypeSource: typeof completeCsharpSourceCallableTypeSource;
  readonly literalCreationContextSource: typeof formCsharpLiteralCreationContextSource;
  readonly completeLiteralCreationContext: (...args: DropScope<Parameters<typeof resolveFormedCsharpLiteralCreationContext>>) =>
    ReturnType<typeof resolveFormedCsharpLiteralCreationContext>;
  readonly projectSemanticSource: (...args: DropScope<Parameters<typeof formCsharpProjectSemanticSource>>) =>
    ReturnType<typeof formCsharpProjectSemanticSource>;
  readonly completeProjectSemantic: (...args: DropScope<Parameters<typeof resolveFormedCsharpProjectSemanticType>>) =>
    ReturnType<typeof resolveFormedCsharpProjectSemanticType>;
  readonly projectReferenceSource: (...args: DropScope<Parameters<typeof formCsharpProjectReferenceSource>>) =>
    ReturnType<typeof formCsharpProjectReferenceSource>;
  readonly completeProjectReference: (...args: DropScope<Parameters<typeof resolveFormedCsharpProjectReference>>) =>
    ReturnType<typeof resolveFormedCsharpProjectReference>;
  readonly selectedSymbolSource: (...args: DropScope<Parameters<typeof formCsharpSelectedSymbolSource>>) =>
    ReturnType<typeof formCsharpSelectedSymbolSource>;
  readonly completeSelectedSymbol: (...args: DropScope<Parameters<typeof resolveFormedCsharpSelectedSymbolType>>) =>
    ReturnType<typeof resolveFormedCsharpSelectedSymbolType>;
  readonly completeAuthoredSelection: (source: CsharpAuthoredTypeSelectionEvidence) => TargetTypeRef | undefined;
  readonly policy: CsharpTypePolicy;
  readonly recursive: CsharpRecursiveTypeResolver;
  readonly structuralTypeApplication: CsharpTypeResolutionScope["formStructuralTypeApplication"];
  readonly bindStructuralTypeApplication: typeof bindCsharpStructuralTypeApplication;
  readonly structuralMemberChildren: CsharpTypeResolutionScope["resolveStructuralMemberChildren"];
}

export function createCsharpTypeResolutionServices(
  host: CsharpTypePolicyHost,
): CsharpTypeResolutionServices {
  let scope!: CsharpTypeResolutionScope;
  const queryCache = createCsharpTypeResolutionQueryCache();
  const activeTypes = new WeakSet<Type>();
  const methods = {
    formStructuralTypeApplication: (...args: DropScope<Parameters<typeof formCsharpStructuralTypeApplication>>) =>
      formCsharpStructuralTypeApplication(scope, ...args),
    resolveStructuralPropertyType: (...args: DropScope<Parameters<typeof resolveCsharpStructuralPropertyType>>) =>
      resolveCsharpStructuralPropertyType(scope, ...args),
    resolveStructuralMemberChildren: (...args: DropScope<Parameters<typeof resolveCsharpStructuralMemberChildren>>) =>
      resolveCsharpStructuralMemberChildren(scope, ...args),
    resolveArrayLiteralWithState: (node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState) =>
      queryCache.resolveArrayLiteral(node, queries.sourceFile, state.depth === 0 && state.sourceBindings === undefined,
        () => resolveCsharpArrayLiteralSelection(scope, node, queries, state)),
    resolveNode: (
      node: Node | undefined,
      sourceFile?: SourceFile,
    ) => resolveNodeImplementation(scope, node, sourceFile),
    resolveType: (
      type: Type | undefined,
      sourceFile: SourceFile,
    ) => resolveTypeImplementation(scope, type, sourceFile),
    nodeQuerySource: (node: Node | undefined, sourceFile?: SourceFile) =>
      queryCache.nodeQuerySource(node, sourceFile, () => formCsharpNodeQuerySource(scope, node, sourceFile)),
    completeNodeQuery(source: CsharpNodeQuerySource) {
      if (source.root.node !== source.node || source.root.sourceFile !== source.sourceFile) {
        return failTargetAnalysisInvariant("tsonic-csharp", "Node query completion requires its exact retained root.", source.node);
      }
      return queryCache.resolveNode(source, () => resolveFormedCsharpNodeQuerySource(scope, source));
    },
    typeQuerySource: (type: Type | undefined, sourceFile: SourceFile) =>
      queryCache.typeQuerySource(type, sourceFile, () => formCsharpTypeQuerySource(scope, type, sourceFile)),
    completeTypeQuery(source: CsharpTypeQuerySource) {
      if (source.root.type !== source.type || source.root.sourceFile !== source.sourceFile) {
        return failTargetAnalysisInvariant("tsonic-csharp", "Type query completion requires its exact retained root.", source.sourceFile);
      }
      return queryCache.resolveType(source, () => resolveFormedCsharpTypeQuerySource(scope, source));
    },
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
    resolveSelectedValueResultWithState: (...args: DropScope<Parameters<typeof resolveSelectedValueResultWithState>>) =>
      resolveSelectedValueResultWithState(scope, ...args),
    resolveFormedSelectedExpressionResult: (...args: DropScope<Parameters<typeof resolveFormedCsharpSelectedExpressionResult>>) =>
      resolveFormedCsharpSelectedExpressionResult(scope, ...args),
    resolveSourceValueResult: (...args: DropScope<Parameters<typeof resolveSourceValueResult>>) =>
      resolveSourceValueResult(scope, ...args),
    resolveSelectedType: (...args: DropScope<Parameters<typeof resolveSelectedTypeImplementation>>) =>
      resolveSelectedTypeImplementation(scope, ...args),
    resolveSelectedResult: (...args: DropScope<Parameters<typeof resolveSelectedResultImplementation>>) =>
      resolveSelectedResultImplementation(scope, ...args),
    resolvePointerReturn: (declaration: Node, state: CsharpTypeResolutionState) =>
      resolveCsharpPointerReturnContract(scope, declaration, state),
    resolveTypedLocationOperationPointee: (...args: DropScope<Parameters<typeof resolveTypedLocationOperationPointeeImplementation>>) =>
      resolveTypedLocationOperationPointeeImplementation(scope, ...args),
    resolveTypedLocationOperationPointeeWithState: (...args: DropScope<Parameters<typeof resolveTypedLocationOperationPointeeWithStateImplementation>>) =>
      resolveTypedLocationOperationPointeeWithStateImplementation(scope, ...args),
    resolveSourceCallTypeArguments: (...args: DropScope<Parameters<typeof resolveSourceCallTypeArgumentsImplementation>>) =>
      resolveSourceCallTypeArgumentsImplementation(scope, ...args),
    resolveSourceCallParameter: (...args: DropScope<Parameters<typeof resolveSourceCallParameterImplementation>>) =>
      resolveSourceCallParameterImplementation(scope, ...args),
    resolveSourceCallParameters: (...args: DropScope<Parameters<typeof resolveSourceCallParametersImplementation>>) =>
      resolveSourceCallParametersImplementation(scope, ...args),
    resolveSourceCallArgumentParameter: (...args: DropScope<Parameters<typeof resolveSourceCallArgumentParameterImplementation>>) =>
      resolveSourceCallArgumentParameterImplementation(scope, ...args),
    resolveSourceCallResult: (...args: DropScope<Parameters<typeof resolveSourceCallResultImplementation>>) =>
      resolveSourceCallResultImplementation(scope, ...args),
    resolveSourceCallResultWithState: (...args: DropScope<Parameters<typeof resolveSourceCallResultWithStateImplementation>>) =>
      resolveSourceCallResultWithStateImplementation(scope, ...args),
    resolveFormedSourceCallResultWithState: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceCallResultWithState>>) =>
      resolveFormedCsharpSourceCallResultWithState(scope, ...args),
    withSourceTargetBindings: (...args: DropScope<Parameters<typeof withSourceTargetBindingsImplementation>>) =>
      withSourceTargetBindingsImplementation(scope, ...args),
    resolveNodeWithState: (
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      state: CsharpTypeResolutionState,
    ) => methods.resolveNodeValueWithState(node, sourceFile, state)?.selectedType,
    resolveNodeValueWithState: (
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      state: CsharpTypeResolutionState,
    ) => methods.resolveFormedNodeTypeSource(formCsharpNodeTypeSource(scope, node, sourceFile, state)),
    resolveFormedNodeTypeSource: (
      source: CsharpNodeTypeSource,
    ): ReturnType<typeof resolveFormedCsharpNodeTypeSource> => {
      const node = source.node;
      if (node === undefined) {
        return undefined;
      }
      if (scope.activeNodes.has(node)) {
        const type = source.cycle?.type;
        return type === undefined ? undefined : csharpSourceValueResult(
          scope.sourceUnionDefinitions.reference(type) ?? host.structuralTypes.resolveReference(type));
      }
      scope.activeNodes.add(node);
      try {
        return resolveFormedCsharpNodeTypeSource(scope, source);
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
    resolveMemberAccessTargetType: (...args: DropScope<Parameters<typeof resolveMemberAccessTargetTypeImplementation>>) =>
      resolveMemberAccessTargetTypeImplementation(scope, ...args),
    resolveNonNullExpressionType: (...args: DropScope<Parameters<typeof resolveNonNullExpressionTypeImplementation>>) =>
      resolveNonNullExpressionTypeImplementation(scope, ...args),
    resolveProjectThisTargetType: (...args: DropScope<Parameters<typeof resolveProjectThisTargetTypeImplementation>>) =>
      resolveProjectThisTargetTypeImplementation(scope, ...args),
    resolveSelectedReceiverTargetType: (...args: DropScope<Parameters<typeof resolveSelectedReceiverTargetTypeImplementation>>) =>
      resolveSelectedReceiverTargetTypeImplementation(scope, ...args),
    completeSelectedReceiver: (...args: DropScope<Parameters<typeof completeCsharpSelectedReceiver>>) =>
      completeCsharpSelectedReceiver(scope, ...args),
    resolveFormedSourceOwnedConstructionResult: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceOwnedConstructionResult>>) =>
      resolveFormedCsharpSourceOwnedConstructionResult(scope, ...args),
    optionalAccessTargetType: optionalAccessTargetTypeImplementation,
    resolveSelectedDeclarationResult: (...args: DropScope<Parameters<typeof resolveSelectedDeclarationResultImplementation>>) =>
      resolveSelectedDeclarationResultImplementation(scope, ...args),
    resolveProjectEnumMemberTarget: (...args: DropScope<Parameters<typeof resolveProjectEnumMemberTargetImplementation>>) =>
      resolveProjectEnumMemberTargetImplementation(scope, ...args),
    declarationResultTypeNode: (...args: DropScope<Parameters<typeof declarationResultTypeNodeImplementation>>) =>
      declarationResultTypeNodeImplementation(scope, ...args),
    resolveFormedTypeReferenceNode: (...args: DropScope<Parameters<typeof resolveTypeReferenceNodeImplementation>>) =>
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
    completeSourceCallableType: (...args: DropScope<Parameters<typeof completeCsharpSourceCallableType>>) =>
      completeCsharpSourceCallableType(scope, ...args),
    inferSourceCallTargetTypeArguments: (...args: DropScope<Parameters<typeof inferSourceCallTargetTypeArgumentsImplementation>>) =>
      inferSourceCallTargetTypeArgumentsImplementation(scope, ...args),
    sourceCallSelectedDeclaration: (...args: DropScope<Parameters<typeof sourceCallSelectedDeclarationImplementation>>) =>
      sourceCallSelectedDeclarationImplementation(scope, ...args),
    resolveSourceCallReceiverTargetType: (...args: DropScope<Parameters<typeof resolveSourceCallReceiverTargetTypeImplementation>>) =>
      resolveSourceCallReceiverTargetTypeImplementation(scope, ...args),
    completeSourceCallReceiver: (...args: DropScope<Parameters<typeof completeCsharpSourceCallReceiver>>) =>
      completeCsharpSourceCallReceiver(scope, ...args),
    resolveSourceCallContract: (...args: DropScope<Parameters<typeof resolveSourceCallContractImplementation>>) =>
      resolveSourceCallContractImplementation(scope, ...args),
    sourceCallableTypeParametersMatch: (...args: DropScope<Parameters<typeof sourceCallableTypeParametersMatchImplementation>>) =>
      sourceCallableTypeParametersMatchImplementation(scope, ...args),
    sourceValueDeclaration: (...args: DropScope<Parameters<typeof sourceValueDeclarationImplementation>>) =>
      sourceValueDeclarationImplementation(scope, ...args),
    sourceValueDeclarationSyntax: (...args: DropScope<Parameters<typeof sourceValueDeclarationSyntaxImplementation>>) =>
      sourceValueDeclarationSyntaxImplementation(scope, ...args),
    resolveTypeWithState: (
      type: Type | undefined,
      sourceFile: SourceFile,
      state: CsharpTypeResolutionState,
    ) => methods.resolveFormedSemanticTypeSource(formCsharpSemanticTypeSource(scope, type, sourceFile, state)),
    resolveFormedSemanticTypeSource: (source: CsharpSemanticTypeSource): TargetTypeRef | undefined => {
      const type = source.type;
      if (type === undefined) {
        return undefined;
      }
      const reference = scope.sourceUnionDefinitions.reference(type) ?? host.structuralTypes.resolveReference(type);
      if (reference !== undefined) return reference;
      if (activeTypes.has(type)) return undefined;
      activeTypes.add(type);
      try {
        return resolveFormedCsharpSemanticTypeSource(scope, source);
      } finally {
        activeTypes.delete(type);
      }
    },
    resolveFormedDirectSourceFacts: (...args: DropScope<Parameters<typeof resolveFormedCsharpDirectSourceFacts>>) =>
      resolveFormedCsharpDirectSourceFacts(scope, ...args),
    resolveProviderType: (...args: DropScope<Parameters<typeof resolveProviderTypeImplementation>>) =>
      resolveProviderTypeImplementation(scope, ...args),
    resolveFormedSemanticTypeArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSemanticTypeArguments>>) =>
      resolveFormedCsharpSemanticTypeArguments(scope, ...args),
    resolveSourceProfileType: (...args: DropScope<Parameters<typeof resolveSourceProfileTypeImplementation>>) =>
      resolveSourceProfileTypeImplementation(scope, ...args),
    generatorProtocol: (typeArguments: readonly TargetTypeRef[]) => generatorProtocolImplementation(typeArguments),
    generatorResultProtocol: (typeArguments: readonly TargetTypeRef[]) => generatorResultProtocolImplementation(typeArguments),
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
  const resolveNominal = (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>): TargetTypeRef | undefined => {
    const file = host.ast.getSourceFile(guard.sourceConstructor);
    return file === undefined ? undefined : resolveCsharpInstanceType(host.semanticsFor(guard.sourceConstructor),
      guard.sourceConstructor, type => methods.resolveType(type, file));
  };
  const policy: CsharpTypePolicy = Object.freeze({
    nativeGuardResult: (expression: Node) => selectCsharpNativeGuardResult(host, expression, methods.resolveStorage, resolveNominal),
    nativeUnreachable: (node: Node) => sourceNodeIsNativeUnreachable(host.ast, node,
      expression => selectCsharpNativeGuardResult(host, expression, methods.resolveStorage, resolveNominal)),
    nativeFlowMembers: (reference: Node, sourceCarrier: TargetTypeRef) => selectCsharpNativeFlowMembers(host, reference, sourceCarrier, resolveNominal),
    nativeFlowTypes: (reference: Node, sourceType: Type) => {
      const file = host.ast.getSourceFile(reference);
      return file === undefined ? undefined : selectCsharpNativeFlowTypeMembers(host, reference, sourceType,
        type => methods.resolveType(type, file), resolveNominal);
    },
    resolveBindingProjection: host.bindingProjection,
    resolveArrayLiteral: (node: Node, sourceFile: SourceFile) =>
      methods.resolveArrayLiteralWithState(node, host.semantics(sourceFile), { depth: 0 }),
    selectFixedArray: createCsharpFixedArrayTypeQuery(host),
    resolveNode: methods.resolveNode,
    resolveStorage: methods.resolveStorage,
    resolveReadStorage: methods.resolveReadStorage,
    resolveType: methods.resolveType,
    selectSourceUnionMember: (carrier: TargetTypeRef, selected: Type, sourceFile: SourceFile) => {
      const queries = host.semantics(sourceFile);
      return scope.sourceUnions.select(carrier, queries.types.literalBaseType(selected) ?? selected, queries);
    },
    resolveValue: methods.resolveValue,
    resolveSelectedValue: methods.resolveSelectedValue,
    resolveSelectedType: methods.resolveSelectedType,
    resolveSelectedResult: methods.resolveSelectedResult,
    resolvePointerReturn: (declaration: Node) => methods.resolvePointerReturn(declaration, { depth: 0 }),
    resolvePointerStoragePointee: producer => resolveCsharpPointerStoragePointee(scope, producer, { depth: 0 }),
    resolveTypedLocationOperationPointee: methods.resolveTypedLocationOperationPointee,
    resolveSourceCallTypeArguments: methods.resolveSourceCallTypeArguments,
    resolveSourceCallParameter: methods.resolveSourceCallParameter,
    resolveSourceCallParameters: methods.resolveSourceCallParameters,
    resolveSourceCallArgumentParameter: methods.resolveSourceCallArgumentParameter,
    resolveSourceCallResult: methods.resolveSourceCallResult,
    withSourceTargetBindings: methods.withSourceTargetBindings,
  } satisfies CsharpTypePolicy);
  scope = Object.freeze({
    host,
    sourceUnions: createCsharpSourceUnionIndex(host.typeDefinitions),
    sourceUnionDefinitions: createCsharpSourceUnionDefinitions(host, methods.resolveTypeWithState),
    activeNodes: new WeakSet<Node>(),
    policy,
    createCsharpTypePolicy,
    ...methods,
  });
  const recursive: CsharpRecursiveTypeResolver = Object.freeze({
    resolveStructuralPropertyType: methods.resolveStructuralPropertyType,
    resolveStructuralMemberChildren: methods.resolveStructuralMemberChildren,
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
  return Object.freeze({ policy, recursive,
    sourceTypeComponentSource: (...args: DropScope<Parameters<typeof formCsharpSourceTypeComponentSource>>) =>
      formCsharpSourceTypeComponentSource(scope, ...args),
    sourceTypeArguments: formCsharpSourceTypeArguments,
    bindSourceTypeArguments: bindCsharpSourceTypeArgumentsSource,
    completeSourceTypeArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceTypeArguments>>) =>
      resolveFormedCsharpSourceTypeArguments(scope, ...args),
    completeSourceTypeComponent: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceTypeComponent>>) =>
      resolveFormedCsharpSourceTypeComponent(scope, ...args),
    authoredSelectionSource: (...args: DropScope<Parameters<typeof formCsharpAuthoredTypeSelectionSource>>) =>
      formCsharpAuthoredTypeSelectionSource(scope, ...args),
    bindAuthoredSelection: bindCsharpAuthoredTypeSelectionSource,
    structuralTypeCapture: (...args: DropScope<Parameters<typeof formCsharpStructuralTypeCapture>>) =>
      formCsharpStructuralTypeCapture(scope, ...args),
    bindStructuralTypeCapture: bindCsharpStructuralTypeCapture,
    directFactsSource: (...args: DropScope<Parameters<typeof formCsharpDirectSourceEvidence>>) =>
      formCsharpDirectSourceEvidence(scope, ...args),
    completeDirectFacts: completeCsharpDirectSourceEvidence,
    semanticTypeArguments: (...args: DropScope<Parameters<typeof formCsharpSemanticTypeArgumentsSource>>) =>
      formCsharpSemanticTypeArgumentsSource(scope, ...args),
    completeSemanticTypeArguments: methods.resolveFormedSemanticTypeArguments,
    sourceDeclarationArguments: (...args: DropScope<Parameters<typeof formCsharpSourceDeclarationArguments>>) =>
      formCsharpSourceDeclarationArguments(scope, ...args),
    completeSourceDeclarationArguments: (...args: DropScope<Parameters<typeof resolveFormedCsharpSourceDeclarationArguments>>) =>
      resolveFormedCsharpSourceDeclarationArguments(scope, ...args),
    nodeQuerySource: methods.nodeQuerySource,
    completeNodeQuery: methods.completeNodeQuery,
    typeQuerySource: methods.typeQuerySource,
    completeTypeQuery: methods.completeTypeQuery,
    nodeRootSource: (...args: DropScope<Parameters<typeof formCsharpNodeTypeSource>>) =>
      formCsharpNodeTypeSource(scope, ...args),
    completeNodeRoot: methods.resolveFormedNodeTypeSource,
    semanticRootSource: (...args: DropScope<Parameters<typeof formCsharpSemanticTypeSource>>) =>
      formCsharpSemanticTypeSource(scope, ...args),
    completeSemanticRoot: methods.resolveFormedSemanticTypeSource,
    callContractSource: (...args: DropScope<Parameters<typeof formCsharpSourceCallContractSource>>) =>
      formCsharpSourceCallContractSource(scope, ...args),
    completeCallContract: (...args: DropScope<Parameters<typeof resolveFormedSourceCallContract>>) =>
      resolveFormedSourceCallContract(scope, ...args),
    completeCallArgumentParameter: (...args: DropScope<Parameters<typeof completeCsharpSourceCallArgumentParameter>>) =>
      completeCsharpSourceCallArgumentParameter(scope, ...args),
    completeCallArgumentParameterSource: completeCsharpSourceCallArgumentParameterSource,
    completeSourceCallableType: methods.completeSourceCallableType,
    completeSourceCallableTypeSource: completeCsharpSourceCallableTypeSource,
    literalCreationContextSource: formCsharpLiteralCreationContextSource,
    completeLiteralCreationContext: (...args: DropScope<Parameters<typeof resolveFormedCsharpLiteralCreationContext>>) =>
      resolveFormedCsharpLiteralCreationContext(scope, ...args),
    projectSemanticSource: (...args: DropScope<Parameters<typeof formCsharpProjectSemanticSource>>) =>
      formCsharpProjectSemanticSource(scope, ...args),
    completeProjectSemantic: (...args: DropScope<Parameters<typeof resolveFormedCsharpProjectSemanticType>>) =>
      resolveFormedCsharpProjectSemanticType(scope, ...args),
    projectReferenceSource: (...args: DropScope<Parameters<typeof formCsharpProjectReferenceSource>>) =>
      formCsharpProjectReferenceSource(scope, ...args),
    completeProjectReference: (...args: DropScope<Parameters<typeof resolveFormedCsharpProjectReference>>) =>
      resolveFormedCsharpProjectReference(scope, ...args),
    selectedSymbolSource: (...args: DropScope<Parameters<typeof formCsharpSelectedSymbolSource>>) =>
      formCsharpSelectedSymbolSource(scope, ...args),
    completeSelectedSymbol: (...args: DropScope<Parameters<typeof resolveFormedCsharpSelectedSymbolType>>) =>
      resolveFormedCsharpSelectedSymbolType(scope, ...args),
    completeAuthoredSelection: (source: CsharpAuthoredTypeSelectionEvidence) =>
      resolveFormedAuthoredAndSelectedSourceType(scope, source),
    structuralTypeApplication: methods.formStructuralTypeApplication,
    bindStructuralTypeApplication: bindCsharpStructuralTypeApplication,
    structuralMemberChildren: methods.resolveStructuralMemberChildren,
  });
}

export function createCsharpTypePolicy(
  host: CsharpTypePolicyHost,
): CsharpTypePolicy {
  return createCsharpTypeResolutionServices(host).policy;
}
