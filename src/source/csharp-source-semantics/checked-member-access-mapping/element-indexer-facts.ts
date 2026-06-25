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
  csharpTargetMemberOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperation,
} from "../operations.js";
import {
  findTargetBinding,
} from "../provider-bindings.js";
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
} from "./diagnostics.js";
import type {
  CheckedElementAccessContext,
  CheckedPropertyAccessContext,
} from "./types.js";

export function mapCsharpNativeArrayCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getNativeArrayReceiverType(request.receiverType, request.receiver, context, host);
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
    request.sourceSelectedContainerSymbol,
    request.sourceSelectedDeclarationContainer,
    request.sourceSelectedDeclaration,
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiverAliasedSymbol,
    request.receiverResolvedSymbol,
    request.receiverSymbol,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName, true);
  }
  const selectedDeclarationFact = context.facts.get(request.sourceSelectedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  const member = findTargetMember(binding, selectedDeclarationFact);
  if (member?.id !== dotnetNativeArrayLengthMemberId) {
    return rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName);
  }
  const operation = csharpTargetOperationFromMember(member);
  recordCsharpTargetOperation(context, request.expression, operation, [{ message: "C# native array length operation recorded from checked TypeScript property access on provider-owned array contract." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(dotnetNativeArrayLengthMemberId, "property", "System.Array.Length", {
      resultType: csharpSourcePrimitiveTargetType("int32"),
    }),
  }, [{ message: "C# native array length selected from checked TypeScript property access on provider-owned array contract." }]);
}

export function mapCsharpNativeArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getNativeArrayReceiverType(request.receiverType, request.receiver, context, host);
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const binding = findTargetBinding(context, [
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiver,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return undefined;
  }
  const virtualDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  const member = findTargetMemberForElementAccess(
    binding,
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
    operation: targetOperation(dotnetNativeArrayIndexerMemberId, "indexer", "System.Array.Item", {
      resultType: receiverType.element,
    }),
  }, [{ message: "C# native array indexer selected from checked TypeScript element access on provider-owned array contract." }]);
}

export function mapCsharpSourceArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = asNativeArrayTargetType(unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, { allowRuntimeCarrier: true }) ??
      host.getTargetTypeRefForSubject(request.receiver, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }),
  ));
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectNonIntegralSourceArrayIndex(extensionId);
  }
  const operationId = "tsonic.csharp.source.array.indexer";
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "indexer", "Item", {
    resultType: receiverType.element,
  }), [{ message: "C# source array indexer operation recorded from checked TypeScript element access and finalized array carrier facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "indexer", "Item", {
      resultType: receiverType.element,
    }),
  }, [{ message: "C# source array element access selected from checked TSTS element access and finalized array carrier facts." }]);
}

export function mapCsharpSourceTupleCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getSourceReceiverTargetType(request.receiverType, request.receiver, context, host);
  if (receiverType?.kind !== "tuple") {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.source.tuple.indexer", "indexer", "Item"),
  }, [{ message: "C# source tuple element access accepted from checked TSTS tuple receiver facts; backend consumes finalized tuple element facts." }]);
}

export function mapCsharpSourceDeclaredReceiverCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (selectedDeclarationIsAmbientOrExternal(request.sourceSelectedDeclaration, context)) {
    return undefined;
  }
  const receiverType = getSourceReceiverTargetType(request.receiverType, request.receiver, context, host);
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  const operationId = "tsonic.csharp.source.indexer";
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "indexer", "Item"), [{ message: "C# source-owned indexer operation recorded from checked TSTS source declaration receiver facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "indexer", "Item"),
  }, [{ message: "C# source-owned element access selected from checked TSTS source declaration receiver facts." }]);
}
