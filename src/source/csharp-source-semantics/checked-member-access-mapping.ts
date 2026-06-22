import {
  acceptObservation,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpTargetMemberOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperation,
  targetOperationFromMember,
} from "./operations.js";
import {
  findTargetBinding,
} from "./provider-bindings.js";
import {
  isAttributeSelectorApplicationTarget,
  isAttributeSelectorBodyExpression,
} from "./source-marker-selectors.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  findTargetMember,
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isAttributeSelectorApplicationTarget(request.expression, context)) {
    return deferObservation;
  }
  if (isAttributeSelectorBodyExpression(request.expression, context)) {
    return deferObservation;
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
  if (binding === undefined) {
    return mapCsharpObjectShapeCheckedPropertyAccess(request, context, host) ?? deferObservation;
  }
  const member = findTargetMember(binding, context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey)) ??
    findTargetPropertyLikeMember(binding, request.propertyName);
  if (member === undefined) {
    if (hasTargetCallableMember(binding, request.propertyName)) {
      return deferObservation;
    }
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_FOUND", 9100102, `C# provider could not map checked property '${request.propertyName}' on target '${binding.id}'.`));
  }
  const declaringTargetType = host.getTargetTypeRefForSubject(request.receiverType, context) ??
    host.getTargetTypeRefForSubject(request.receiver, context);
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_RENDERABLE", 9100105, `C# provider selected property '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target member property operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function findTargetPropertyLikeMember(binding: TargetBindingFact, propertyName: string): TargetMember | undefined {
  const members = (binding.members ?? []).filter((member) =>
    member.sourceName === propertyName &&
    (member.kind === "property" || member.kind === "field" || member.kind === "indexer")
  );
  return members.length === 1 ? members[0] : undefined;
}

function hasTargetCallableMember(binding: TargetBindingFact, propertyName: string): boolean {
  return (binding.members ?? []).some((member) =>
    member.sourceName === propertyName &&
    (member.kind === "method" || member.kind === "constructor" || member.kind === "operator")
  );
}

export function mapCsharpCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const binding = findTargetBinding(context, [
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiver,
  ]);
  if (binding === undefined) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ?? deferObservation;
  }
  const indexers = (binding.members ?? []).filter((member) => member.kind === "indexer");
  const member = indexers.length === 1 ? indexers[0] : undefined;
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider could not map checked element access on target '${binding.id}' to a unique indexer.`));
  }
  const declaringTargetType = host.getTargetTypeRefForSubject(request.receiverType, context) ??
    host.getTargetTypeRefForSubject(request.receiver, context);
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_RENDERABLE", 9100106, `C# provider selected indexer '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target indexer operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target indexer access selected from checked TSTS provider declaration." }]);
}

function mapCsharpObjectShapeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const objectShape = host.getCsharpObjectShapeFactForSubject(request.receiver, context) ??
    host.getCsharpObjectShapeFactForSubject(request.receiverType, context) ??
    host.getCsharpObjectShapeFactForSubject(request.receiverSymbol, context) ??
    host.getCsharpObjectShapeFactForSubject(request.receiverResolvedSymbol, context) ??
    host.getCsharpObjectShapeFactForSubject(request.receiverAliasedSymbol, context);
  if (objectShape === undefined) {
    return undefined;
  }
  const member = objectShape.members.find((candidate) => candidate.sourceName === request.propertyName);
  if (member === undefined) {
    return undefined;
  }
  const operationId = `tsonic.csharp.objectShape.${request.propertyName}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, member.memberKind === "method" ? "method" : "property", member.targetName, {
    resultType: member.type,
  }), [{ message: "C# object-shape member operation recorded from finalized structural shape fact." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      operationId,
      member.memberKind === "method" ? "method" : "property",
      member.targetName,
      { resultType: member.type },
    ),
  }, [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
}

function mapCsharpNativeArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, noRuntimeCarrierQuery) ??
      host.getTargetTypeRefForSubject(request.receiver, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }),
  );
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100109, "C# native array element access requires an integral TSTS/provider-backed index type."));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.array.indexer", "indexer", "Item", {
    resultType: receiverType.element,
  }), [{ message: "C# native array indexer operation recorded from checked TypeScript element access." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.array.indexer", "indexer", "System.Array.Item", {
      resultType: receiverType.element,
    }),
  }, [{ message: "C# native array indexer selected from checked TypeScript element access." }]);
}
