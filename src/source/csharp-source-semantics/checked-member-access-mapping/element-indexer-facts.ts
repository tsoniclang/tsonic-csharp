import {
  acceptObservation,
  providerVirtualDeclarationFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  csharpTargetMemberOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperation,
  targetOperationFromMember,
} from "../operations.js";
import {
  findTargetBinding,
} from "../provider-bindings.js";
import {
  getCsharpCheckedElementAccessRequestContext,
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../target-types.js";
import {
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "../target-rules.js";
import {
  findTargetMember,
  findTargetMemberForElementAccess,
  isLiteralRepresentableAsTargetType,
} from "../target-member-selection.js";
import {
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";
import {
  asNativeArrayTargetType,
  getNativeArrayReceiverType,
  getSourceReceiverTargetType,
  selectedDeclarationIsAmbientOrExternal,
  targetTypeRefIsSourceDeclaredReceiver,
} from "./lifecycle-helpers.js";
import {
  rejectNativeArrayIndexerNotFound,
  rejectNativeArrayPropertyNotSupported,
  rejectNonIntegralNativeArrayIndex,
  rejectNonIntegralSourceArrayIndex,
  rejectSourceIndexerResultTypeNotProven,
  rejectTupleElementCarrierMissing,
  rejectTupleElementIndexNotProven,
} from "./diagnostics.js";
import type {
  CheckedElementAccessContext,
  CheckedPropertyAccessContext,
} from "./types.js";
import {
  csharpTupleElementMemberName,
} from "../tuple-element-members.js";
import {
  csharpSourceProfileIndexerMember,
  getCsharpSourceProfileMemberIdentity,
} from "../source-profile-operations.js";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";

export function mapCsharpNativeArrayCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const receiverType = getNativeArrayReceiverType(undefined, request.receiver, context, host);
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const selectedOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  const selectedCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey);
  if (selectedOperation !== undefined && selectedCsharpOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: selectedOperation,
    }, [{ message: "C# array property access reused finalized provider/surface target operation facts." }]);
  }
  const binding = findTargetBinding(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclarationContainer,
    requestContext.sourceSelectedDeclaration,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName, true);
  }
  const targetBinding = binding.target === csharpTargetId
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  const selectedDeclarationFact = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  const member = findTargetMember(targetBinding, selectedDeclarationFact);
  if (member?.id !== dotnetNativeArrayLengthMemberId) {
    return rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName);
  }
  const operation = csharpTargetOperationFromMember(member);
  recordCsharpTargetOperation(context, request.expression, operation, [{ message: "C# native array length operation recorded from checked TypeScript property access on provider-owned array contract." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(dotnetNativeArrayLengthMemberId, "property", "System.Array.Length"),
  }, [{ message: "C# native array length selected from checked TypeScript property access on provider-owned array contract." }]);
}

export function mapCsharpNativeArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverType = getNativeArrayReceiverType(undefined, request.receiver, context, host);
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const sourceProfileMember = csharpSourceProfileIndexerMember(
    getCsharpSourceProfileMemberIdentity(request.sourceSelectedDeclaration, context),
    receiverType.element,
  );
  if (sourceProfileMember !== undefined) {
    const selectedResultType = host.getTargetTypeRefForSubject(request.sourceResultType, context);
    if (selectedResultType !== undefined && !targetTypeRefEquals(selectedResultType, receiverType.element)) {
      return rejectSourceIndexerResultTypeNotProven(extensionId);
    }
    const indexType = host.getTargetTypeRefForSubject(request.argument, context);
    if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
      return rejectNonIntegralNativeArrayIndex(extensionId);
    }
    const operation = csharpTargetOperationFromMember(sourceProfileMember);
    recordCsharpTargetOperation(context, request.expression, operation, [{ message: "C# native array indexer operation recorded from TSTS-selected C# source-profile index signature and finalized array carrier facts." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperationFromMember(sourceProfileMember),
    }, [{ message: "C# native array indexer selected from the exact Tsonic C# source-profile index signature." }]);
  }
  const selectedOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  const selectedCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey);
  if (selectedOperation !== undefined && selectedCsharpOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: selectedOperation,
    }, [{ message: "C# array element access reused finalized provider/surface target operation facts." }]);
  }
  const binding = findTargetBinding(context, [
    request.receiver,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return undefined;
  }
  const targetBinding = binding.target === csharpTargetId
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  const virtualDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  const member = findTargetMemberForElementAccess(
    targetBinding,
    virtualDeclaration,
    request,
    context,
    host.getTargetTypeRefForSubject,
    { declaringTargetType: receiverType },
  );
  if (member?.id !== dotnetNativeArrayIndexerMemberId) {
    return rejectNativeArrayIndexerNotFound(extensionId);
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectNonIntegralNativeArrayIndex(extensionId);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember({
    ...member,
    returnType: receiverType.element,
  }), [{ message: "C# native array indexer operation recorded from checked TypeScript element access on provider-owned array contract." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(dotnetNativeArrayIndexerMemberId, "indexer", "System.Array.Item"),
  }, [{ message: "C# native array indexer selected from checked TypeScript element access on provider-owned array contract." }]);
}

function resolveProviderVirtualDeclaration(
  context: CheckedElementAccessContext | CheckedPropertyAccessContext,
  subjects: readonly (object | undefined)[],
) {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function mapCsharpSourceArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# source array element access reused existing finalized target operation for repeated checked-element observation." }]);
  }
  const receiverType = asNativeArrayTargetType(unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiver, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }),
  ));
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const sourceProfileMember = csharpSourceProfileIndexerMember(
    getCsharpSourceProfileMemberIdentity(request.sourceSelectedDeclaration, context),
    receiverType.element,
  );
  if (sourceProfileMember === undefined) {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectNonIntegralSourceArrayIndex(extensionId);
  }
  const operation = csharpTargetOperationFromMember(sourceProfileMember);
  recordCsharpTargetOperation(context, request.expression, operation, [{ message: "C# source array indexer operation recorded from the TSTS-selected C# source-profile index signature and finalized array carrier facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(sourceProfileMember),
  }, [{ message: "C# source array element access selected from the exact Tsonic C# source-profile index signature." }]);
}

export function mapCsharpSourceTupleCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getSourceReceiverTargetType(undefined, request.receiver, context, host);
  if (receiverType?.kind !== "tuple") {
    return undefined;
  }
  const index = request.sourceSelectedElementIndex;
  if (index === undefined) {
    return rejectTupleElementIndexNotProven(extensionId);
  }
  const resultType = receiverType.elements[index];
  if (resultType === undefined) {
    return rejectTupleElementCarrierMissing(extensionId, index);
  }
  const operationId = `tsonic.csharp.source.tuple.item.${index}`;
  const memberName = csharpTupleElementMemberName(index);
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "property", memberName, {
    resultType,
  }), [{ message: "C# source tuple element member operation recorded from checked TSTS tuple receiver and literal element index facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "indexer", memberName, {
      resultType,
    }),
  }, [{ message: "C# source tuple element access selected from checked TSTS tuple receiver and literal element index facts." }]);
}

export function mapCsharpSourceDeclaredReceiverCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverType = getSourceReceiverTargetType(undefined, request.receiver, context, host);
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  if (
    requestContext.sourceSelectedDeclaration === undefined ||
    selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)
  ) {
    return undefined;
  }
  const resultType = host.getTargetTypeRefForSubject(request.sourceResultType, context);
  if (resultType === undefined) {
    return rejectSourceIndexerResultTypeNotProven(extensionId);
  }
  const operationId = "tsonic.csharp.source.indexer";
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "indexer", "Item", { resultType }), [{ message: "C# source-owned indexer operation recorded from TSTS-selected source index-signature declaration and source result type evidence." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "indexer", "Item", { resultType }),
  }, [{ message: "C# source-owned element access selected from TSTS-selected source index-signature evidence." }]);
}
