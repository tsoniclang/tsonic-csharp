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
  asNodeSubject,
} from "../ast-utils.js";
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
  rejectTupleElementCarrierMissing,
  rejectTupleElementIndexNotProven,
} from "./diagnostics.js";
import type {
  CheckedElementAccessContext,
  CheckedPropertyAccessContext,
} from "./types.js";
import {
  csharpTupleElementMemberName,
  getTstsTupleElementIndex,
} from "../tuple-element-index.js";

export function mapCsharpNativeArrayCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const receiverType = getNativeArrayReceiverType(requestContext.receiverType, request.receiver, context, host);
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
    requestContext.sourceSelectedContainerSymbol,
    requestContext.sourceSelectedDeclarationContainer,
    requestContext.sourceSelectedDeclaration,
    requestContext.receiverTypeSymbol,
    requestContext.receiverType,
    requestContext.receiverAliasedSymbol,
    requestContext.receiverResolvedSymbol,
    requestContext.receiverSymbol,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName, true);
  }
  const selectedDeclarationFact = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
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
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverType = getNativeArrayReceiverType(requestContext.receiverType, request.receiver, context, host);
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const binding = findTargetBinding(context, [
    requestContext.receiverTypeSymbol,
    requestContext.receiverType,
    request.receiver,
  ]);
  if (binding?.id !== dotnetNativeArrayTypeId) {
    return undefined;
  }
  const virtualDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
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
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverType = asNativeArrayTargetType(unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(requestContext.receiverType, context, { allowRuntimeCarrier: true }) ??
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
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverType = getSourceReceiverTargetType(requestContext.receiverType, request.receiver, context, host);
  if (receiverType?.kind !== "tuple") {
    return undefined;
  }
  const argumentNode = asNodeSubject(request.argument);
  const sourceFile = argumentNode === undefined ? undefined : context.compiler?.ast.getSourceFile(argumentNode);
  const index = getTstsTupleElementIndex(argumentNode, sourceFile, context.compiler === undefined ? undefined : {
    kindName: (node) => context.compiler!.ast.kindName(node),
    text: (node) => context.compiler!.ast.text(node),
    getConstantValue: (node, options) => context.compiler!.typeShape.getConstantValue(node, options),
    getSymbolAtLocation: (node, options) => context.compiler!.checker.getSymbolAtLocation(node, options),
    getResolvedSymbol: (node, options) => context.compiler!.checker.getResolvedSymbolOrNil(node, options) ?? undefined,
    getSymbolDeclarations: (symbol) => context.compiler!.checker.getSymbolDeclarations(symbol),
  });
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
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  if (
    requestContext.sourceSelectedDeclaration === undefined ||
    selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)
  ) {
    return undefined;
  }
  const receiverType = getSourceReceiverTargetType(requestContext.receiverType, request.receiver, context, host);
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  const operationId = "tsonic.csharp.source.indexer";
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "indexer", "Item"), [{ message: "C# source-owned indexer operation recorded from checked TSTS source declaration receiver facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "indexer", "Item"),
  }, [{ message: "C# source-owned element access selected from checked TSTS source declaration receiver facts." }]);
}
