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
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
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
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  const binding = findTargetBinding(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
    requestContext.receiverTypeSymbol,
    requestContext.receiverType,
    requestContext.receiverAliasedSymbol,
    requestContext.receiverResolvedSymbol,
    requestContext.receiverSymbol,
    request.receiver,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    selectedDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  );
  if (binding === undefined) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ??
      mapCsharpSourceArrayCheckedElementAccess(request, context, extensionId, host) ??
      mapCsharpSourceTupleCheckedElementAccess(request, context, host) ??
      mapCsharpSourceDeclaredReceiverCheckedElementAccess(request, context, host) ??
      rejectElementAccessNotMapped(extensionId);
  }
  if (binding.id === dotnetNativeArrayTypeId) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ?? deferObservation;
  }
  const declaringTargetType = getDeclaringTargetType({ receiver: request.receiver, receiverType: requestContext.receiverType }, context, host);
  const selected = selectCheckedElementTargetMember(binding, request, context, host, declaringTargetType);
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(binding, selected.selectedDeclaration);
  if (unsupportedSelectedMember !== undefined) {
    return rejectTargetIndexerUnsupported(extensionId, unsupportedSelectedMember, binding.id);
  }
  const member = selected.member;
  if (member === undefined) {
    return rejectTargetIndexerNotFound(extensionId, binding.id);
  }
  if (member.kind !== "indexer") {
    return rejectNonIndexerSelectedForElementAccess(extensionId, member.id, binding.id);
  }
  const csharpMember = instantiateClosedSelectedTargetMember(member, host, declaringTargetType);
  if (csharpMember === undefined) {
    return rejectTargetIndexerNotRenderable(extensionId, member.id);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target indexer operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target indexer access selected from checked TSTS provider declaration." }]);
}
