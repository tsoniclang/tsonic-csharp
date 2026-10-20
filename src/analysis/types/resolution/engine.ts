import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { sourceTypeSyntaxRoot, sourceNodeIsNativeUnreachable } from "@tsonic/target-api/source";

import { resolveSourceCallContract as resolveSourceCallContractImplementation } from "./call-contracts.js";

import { resolveCsharpPointerReturnContract } from "../../callables/pointer-return.js";

import type { CsharpRecursiveTypeResolver, CsharpTypePolicyHost, CsharpTypePolicy, CsharpTypeResolutionState } from "./model.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { createCsharpSourceUnionIndex } from "./source-unions.js";
import { createCsharpSourceUnionDefinitions } from "./union-definitions.js";
import { createCsharpFixedArrayTypeQuery } from "./source-markers.js";
import { selectCsharpNativeFlowMembers, selectCsharpNativeFlowTypeMembers, selectCsharpNativeGuardResult } from "./native-flow-refinement.js";
import { resolveCsharpArrayLiteralSelection } from "./array-literals.js";

import { resolveCsharpInstanceType } from "./instance-tests.js";
import type { SourceNativeValueGuard } from "@tsonic/target-api/source";

import { resolveNode as resolveNodeImplementation, resolveType as resolveTypeImplementation, resolveStorage as resolveStorageImplementation, resolveReadStorage as resolveReadStorageImplementation, catchVariableStorageCarrier as catchVariableStorageCarrierImplementation, resolveValue as resolveValueImplementation, resolveSelectedValue as resolveSelectedValueImplementation, resolveSelectedValueWithState as resolveSelectedValueWithStateImplementation, resolveSelectedType as resolveSelectedTypeImplementation, resolveSelectedResult as resolveSelectedResultImplementation, resolveTypedLocationOperationPointee as resolveTypedLocationOperationPointeeImplementation, resolveTypedLocationOperationPointeeWithState as resolveTypedLocationOperationPointeeWithStateImplementation, resolveSourceCallTypeArguments as resolveSourceCallTypeArgumentsImplementation, resolveSourceCallParameter as resolveSourceCallParameterImplementation, resolveSourceCallParameters as resolveSourceCallParametersImplementation, resolveSourceCallArgumentParameter as resolveSourceCallArgumentParameterImplementation, resolveSourceCallResult as resolveSourceCallResultImplementation, resolveSourceCallResultWithState as resolveSourceCallResultWithStateImplementation, withSourceTargetBindings as withSourceTargetBindingsImplementation } from "../../../policy/types/resolution/public-api.js";
import { resolveNodeWithState as resolveNodeWithStateImplementation, resolveTupleTypeNode as resolveTupleTypeNodeImplementation, tupleElementIsRest as tupleElementIsRestImplementation } from "./nodes.js";
import { resolveSelectedExpressionType as resolveSelectedExpressionTypeImplementation, resolveMemberAccessTargetType as resolveMemberAccessTargetTypeImplementation, resolveNonNullExpressionType as resolveNonNullExpressionTypeImplementation, resolveProjectThisTargetType as resolveProjectThisTargetTypeImplementation, resolveSourceOwnedCallResult as resolveSourceOwnedCallResultImplementation, resolveSelectedReceiverTargetType as resolveSelectedReceiverTargetTypeImplementation, resolveSourceOwnedConstructionResult as resolveSourceOwnedConstructionResultImplementation, optionalAccessTargetType as optionalAccessTargetTypeImplementation } from "../../../policy/types/resolution/expressions.js";
import { resolveSelectedDeclarationResult as resolveSelectedDeclarationResultImplementation, resolveProjectEnumMemberTarget as resolveProjectEnumMemberTargetImplementation, declarationResultTypeNode as declarationResultTypeNodeImplementation } from "./declarations.js";
import { resolveTypeReferenceNode as resolveTypeReferenceNodeImplementation, resolveCheckerTransformedSourceType as resolveCheckerTransformedSourceTypeImplementation, resolveStandardSourceTypeTransformation as resolveStandardSourceTypeTransformationImplementation, resolveSignatureParameterListTarget as resolveSignatureParameterListTargetImplementation, resolveEvidenceNodesToCommonTarget as resolveEvidenceNodesToCommonTargetImplementation, resolveCompositionalSourceTypeAlias as resolveCompositionalSourceTypeAliasImplementation, targetPreservesAuthoredSourcePrimitiveFacts as targetPreservesAuthoredSourcePrimitiveFactsImplementation, collectTargetSourcePrimitiveNames as collectTargetSourcePrimitiveNamesImplementation, resolveSourceValueDeclaration as resolveSourceValueDeclarationImplementation } from "../../../policy/types/resolution/source-references.js";
import { resolveSourceCallInstantiation as resolveSourceCallInstantiationImplementation, resolveSourceCallSelectedType as resolveSourceCallSelectedTypeImplementation, resolveSourceCallableContractType as resolveSourceCallableContractTypeImplementation, inferSourceCallTargetTypeArguments as inferSourceCallTargetTypeArgumentsImplementation, sourceCallSelectedDeclaration as sourceCallSelectedDeclarationImplementation, resolveSourceCallReceiverTargetType as resolveSourceCallReceiverTargetTypeImplementation, sourceCallableTypeParametersMatch as sourceCallableTypeParametersMatchImplementation, sourceValueDeclaration as sourceValueDeclarationImplementation, sourceValueDeclarationSyntax as sourceValueDeclarationSyntaxImplementation } from "./calls.js";
import { resolveAuthoredAndSelectedSourceType as resolveAuthoredAndSelectedSourceTypeImplementation } from "./selected-values.js";
import { resolveTypeWithState as resolveTypeWithStateImplementation, resolveDirectSourceFacts as resolveDirectSourceFactsImplementation, resolveProviderType as resolveProviderTypeImplementation, resolveSemanticTypeArguments as resolveSemanticTypeArgumentsImplementation } from "../../../policy/types/resolution/semantic-types.js";
import { resolveSourceProfileType as resolveSourceProfileTypeImplementation, resolveUnionType as resolveUnionTypeImplementation, resolveCallableType as resolveCallableTypeImplementation, resolveCallableEvidence as resolveCallableEvidenceImplementation, resolveSignatureParameterEvidence as resolveSignatureParameterEvidenceImplementation, resolveSourceTypeComponentEvidence as resolveSourceTypeComponentEvidenceImplementation } from "./source-profiles.js";
import { generatorProtocol as generatorProtocolImplementation, generatorResultProtocol as generatorResultProtocolImplementation } from "../../../policy/operations/source-profiles/type-carriers.js";
import { resolveSelectedSymbolType as resolveSelectedSymbolTypeImplementation, resolveProjectSourceSemanticType as resolveProjectSourceSemanticTypeImplementation, resolveProjectSourceType as resolveProjectSourceTypeImplementation, projectSourceDeclarationTargetType as projectSourceDeclarationTargetTypeImplementation } from "./project-types.js";
import { createCsharpTypeResolutionQueryCache } from "./query-cache.js";

import type { CsharpTypeResolutionScope } from "./scope.js";
type DropScope<Arguments extends readonly unknown[]> =
  Arguments extends readonly [unknown, ...infer Rest] ? Rest : never;

export interface CsharpTypeResolutionServices {
  readonly policy: CsharpTypePolicy;
  readonly recursive: CsharpRecursiveTypeResolver;
}

export function createCsharpTypeResolutionServices(
  host: CsharpTypePolicyHost,
): CsharpTypeResolutionServices {
  let scope!: CsharpTypeResolutionScope;
  const queryCache = createCsharpTypeResolutionQueryCache();
  const activeTypes = new WeakSet<Type>();
  const methods = {
    resolveArrayLiteralWithState: (node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState) =>
      queryCache.resolveArrayLiteral(node, queries.sourceFile, state.depth === 0 && state.sourceBindings === undefined,
        () => resolveCsharpArrayLiteralSelection(scope, node, queries, state)),
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
    withSourceTargetBindings: (...args: DropScope<Parameters<typeof withSourceTargetBindingsImplementation>>) =>
      withSourceTargetBindingsImplementation(scope, ...args),
    resolveNodeWithState: (
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      state: CsharpTypeResolutionState,
    ) => {
      if (node === undefined) {
        return undefined;
      }
      if (scope.activeNodes.has(node)) {
        const root = sourceTypeSyntaxRoot(host.ast, node);
        if (!host.ast.is.IsTypeReferenceNode(root) && !host.ast.is.IsUnionTypeNode(root) && !host.ast.is.IsTypeLiteralNode(root)) return undefined;
        const queries = sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile);
        const type = queries.types.authoredType(node);
        return type === undefined ? undefined
          : scope.sourceUnionDefinitions.reference(type) ?? host.structuralTypes.resolveReference(type);
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
    resolveMemberAccessTargetType: (...args: DropScope<Parameters<typeof resolveMemberAccessTargetTypeImplementation>>) =>
      resolveMemberAccessTargetTypeImplementation(scope, ...args),
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
    ) => {
      if (type === undefined) {
        return undefined;
      }
      const reference = scope.sourceUnionDefinitions.reference(type) ?? host.structuralTypes.resolveReference(type);
      if (reference !== undefined) return reference;
      if (activeTypes.has(type)) return undefined;
      activeTypes.add(type);
      try {
        return resolveTypeWithStateImplementation(scope, type, sourceFile, state);
      } finally {
        activeTypes.delete(type);
      }
    },
    resolveDirectSourceFacts: (...args: DropScope<Parameters<typeof resolveDirectSourceFactsImplementation>>) =>
      resolveDirectSourceFactsImplementation(scope, ...args),
    resolveProviderType: (...args: DropScope<Parameters<typeof resolveProviderTypeImplementation>>) =>
      resolveProviderTypeImplementation(scope, ...args),
    resolveSemanticTypeArguments: (...args: DropScope<Parameters<typeof resolveSemanticTypeArgumentsImplementation>>) =>
      resolveSemanticTypeArgumentsImplementation(scope, ...args),
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
    nativeGuardResult: (expression: Node) => selectCsharpNativeGuardResult(host, expression, methods.resolveStorage),
    nativeUnreachable: (node: Node) => sourceNodeIsNativeUnreachable(host.ast, node,
      expression => selectCsharpNativeGuardResult(host, expression, methods.resolveStorage)),
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
    resolveValue: methods.resolveValue,
    resolveSelectedValue: methods.resolveSelectedValue,
    resolveSelectedType: methods.resolveSelectedType,
    resolveSelectedResult: methods.resolveSelectedResult,
    resolvePointerReturn: (declaration: Node) => methods.resolvePointerReturn(declaration, { depth: 0 }),
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
