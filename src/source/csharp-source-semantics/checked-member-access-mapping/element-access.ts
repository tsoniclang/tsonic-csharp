import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperationFromMember,
} from "../operations.js";
import {
  applyProviderVirtualExternAlias,
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
  findTargetBindingFromResolvedTargetType,
} from "../provider-bindings.js";
import {
  getCsharpCheckedElementAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";
import {
  mapCsharpNativeArrayCheckedElementAccess,
  mapCsharpSourceArrayCheckedElementAccess,
  mapCsharpSourceDeclaredReceiverCheckedElementAccess,
  mapCsharpSourceTupleCheckedElementAccess,
} from "./element-indexer-facts.js";
import {
  getDeclaringTargetType,
  instantiateClosedSelectedTargetMember,
  resolveProviderVirtualDeclaration,
  selectCheckedElementTargetMember,
} from "./selected-member.js";
import {
  rejectElementAccessNotMapped,
  rejectNonIndexerSelectedForElementAccess,
  rejectTargetIndexerNotFound,
  rejectTargetIndexerNotRenderable,
  rejectTargetIndexerUnsupported,
} from "./diagnostics.js";
import type {
  CheckedElementAccessContext,
} from "./types.js";

export function mapCsharpCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (request.sourceResult.selectedSymbol === undefined && request.sourceResult.selectedDeclaration === undefined) {
    return rejectElementAccessNotMapped(extensionId);
  }
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  const binding = findTargetBinding(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
    request.sourceReceiver.selectedSymbol,
    request.sourceReceiver.selectedDeclaration,
    request.sourceReceiver.type,
    request.sourceReceiver.expression,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    selectedDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  ) ?? findTargetBindingFromResolvedTargetType(
    context,
    [request.sourceReceiver.type, request.sourceReceiver.expression],
    host.getTargetTypeRefForSubject,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  );
  if (binding === undefined) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ??
      mapCsharpSourceArrayCheckedElementAccess(request, context, extensionId, host) ??
      mapCsharpSourceTupleCheckedElementAccess(request, context, extensionId, host) ??
      mapCsharpSourceDeclaredReceiverCheckedElementAccess(request, context, extensionId, host) ??
      rejectElementAccessNotMapped(extensionId);
  }
  if (binding.id === dotnetNativeArrayTypeId) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ?? deferObservation;
  }
  const targetBinding = binding.target === csharpTargetId
    ? applyProviderVirtualExternAlias(host.getCsharpTargetBindingByTargetId(binding.id) ?? binding, selectedDeclaration) ?? binding
    : binding;
  const declaringTargetType = getDeclaringTargetType({ receiver: request.sourceReceiver.expression }, context, host);
  const selected = selectCheckedElementTargetMember(targetBinding, request, context, host, declaringTargetType);
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(targetBinding, selected.selectedDeclaration);
  if (unsupportedSelectedMember !== undefined) {
    return rejectTargetIndexerUnsupported(extensionId, unsupportedSelectedMember, targetBinding.id);
  }
  const member = selected.member;
  if (member === undefined) {
    return rejectTargetIndexerNotFound(extensionId, targetBinding.id);
  }
  if (member.kind !== "indexer") {
    return rejectNonIndexerSelectedForElementAccess(extensionId, member.id, targetBinding.id);
  }
  const selectedResultType = host.getTargetTypeRefForSubject(request.sourceResult.type, context);
  const csharpMember = instantiateClosedSelectedTargetMember(member, host, {
    ...(declaringTargetType === undefined ? {} : { declaringTargetType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
  });
  if (csharpMember === undefined) {
    return rejectTargetIndexerNotRenderable(extensionId, member.id);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target indexer operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target indexer access selected from checked TSTS provider declaration." }]);
}
