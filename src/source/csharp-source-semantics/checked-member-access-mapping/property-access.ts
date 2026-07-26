import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
} from "@tsonic/tsts";
import {
  csharpProjectSourceFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperation,
  targetOperationFromMember,
} from "../operations.js";
import {
  applyProviderVirtualExternAlias,
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
  findTargetBindingFromResolvedTargetType,
} from "../provider-bindings.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";
import {
  mapCsharpNativeArrayCheckedPropertyAccess,
} from "./element-indexer-facts.js";
import {
  mapCsharpObjectShapeCheckedPropertyAccess,
  mapCsharpProjectSourceCheckedPropertyAccess,
  mapCsharpSourceCoreStructCheckedPropertyAccess,
  mapCsharpSourceDeclaredReceiverCheckedPropertyAccess,
} from "./property-facts.js";
import {
  getDeclaringTargetType,
  instantiateClosedSelectedTargetMember,
  resolveProviderVirtualDeclaration,
  selectCheckedPropertyTargetMember,
} from "./selected-member.js";
import {
  rejectNativeArrayPropertyNotSupported,
  rejectPropertyAccessNotMapped,
  rejectTargetEventUnsupported,
  rejectTargetPropertyNotFound,
  rejectTargetPropertyNotRenderable,
  rejectTargetPropertyUnsupported,
} from "./diagnostics.js";
import type {
  CheckedPropertyAccessContext,
} from "./types.js";
import {
  csharpSourceProfileCallMember,
  csharpSourceProfilePropertyMember,
  getCsharpSourceProfileDeclarationFact,
  getCsharpSourceProfileMemberIdentity,
} from "../source-profile-operations.js";
import {
  csharpSourceProfileOwnerId,
} from "../source-profile-declarations.js";
import {
  getSelectedAccessEvidence,
} from "../selected-source-evidence.js";

export function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const selectedEvidence = getSelectedAccessEvidence(request);
  if (selectedEvidence.selectedSymbol === undefined && selectedEvidence.selectedDeclaration === undefined) {
    return rejectPropertyAccessNotMapped(extensionId, request.propertyName);
  }
  const sourceProfileProperty = mapCsharpSourceProfilePropertyAccess(request, context);
  if (sourceProfileProperty !== undefined) {
    return sourceProfileProperty;
  }
  const sourceProfileMethodGroup = mapCsharpSourceProfileMethodGroupPropertyAccess(request, context);
  if (sourceProfileMethodGroup !== undefined) {
    return sourceProfileMethodGroup;
  }
  const selectedSourceProfileDeclaration = getCsharpSourceProfileDeclarationFact(
    selectedEvidence.selectedDeclaration,
    context,
  );
  if (
    selectedSourceProfileDeclaration !== undefined &&
    selectedSourceProfileDeclaration.ownerId !== csharpSourceProfileOwnerId
  ) {
    return deferObservation;
  }
  const providerMethodGroup = mapSelectedProviderMethodGroupPropertyAccess(request, context);
  if (providerMethodGroup !== undefined) {
    return providerMethodGroup;
  }
  const sourceOwnedMethodGroup = mapSelectedSourceOwnedMethodGroupPropertyAccess(request, context);
  if (sourceOwnedMethodGroup !== undefined) {
    return sourceOwnedMethodGroup;
  }
  const sourceCoreStructProperty = mapCsharpSourceCoreStructCheckedPropertyAccess(request, context);
  if (sourceCoreStructProperty !== undefined) {
    return sourceCoreStructProperty;
  }
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
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
    const mapped = mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ??
      mapCsharpObjectShapeCheckedPropertyAccess(request, context, host) ??
      mapCsharpProjectSourceCheckedPropertyAccess(request, context) ??
      mapCsharpSourceDeclaredReceiverCheckedPropertyAccess(request, context, host);
    return mapped ?? (context.phase === "checking"
      ? deferObservation
      : rejectPropertyAccessNotMapped(extensionId, request.propertyName));
  }
  if (binding.id === dotnetNativeArrayTypeId) {
    return mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ??
      rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName);
  }
  const targetBinding = binding.target === csharpTargetId
    ? applyProviderVirtualExternAlias(host.getCsharpTargetBindingByTargetId(binding.id) ?? binding, selectedDeclaration) ?? binding
    : binding;
  const selected = selectCheckedPropertyTargetMember(targetBinding, request, context);
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(targetBinding, selected.selectedDeclaration);
  if (unsupportedSelectedMember !== undefined && unsupportedSelectedMember.memberKind !== "event") {
    return rejectTargetPropertyUnsupported(extensionId, unsupportedSelectedMember, targetBinding.id);
  }
  const member = selected.member;
  if (member === undefined) {
    if (request.use === "call-callee") {
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation("csharp.provider.method-group-call-callee", "property", "__tsonic_provider_method_group"),
      }, [{ message: "C# provider method-group property access was checked as a call callee; the parent checked call must provide selected provider signature facts before emission." }]);
    }
    return rejectTargetPropertyNotFound(extensionId, request.propertyName, targetBinding.id);
  }
  if (member.kind === "event") {
    return rejectTargetEventUnsupported(extensionId, member, targetBinding.id, unsupportedSelectedMember);
  }
  if (member.kind === "method" && request.use === "call-callee") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperationFromMember(member),
      ...(member.returnType === undefined ? {} : { resultType: member.returnType }),
    }, [{ message: "C# provider method-group property access accepted from checked TSTS call callee; call emission uses the finalized selected call fact." }]);
  }
  const declaringTargetType = getDeclaringTargetType({ receiver: request.sourceReceiver.expression }, context, host);
  const selectedResultType = host.getTargetTypeRefForSubject(selectedEvidence.type, context);
  const csharpMember = instantiateClosedSelectedTargetMember(member, host, {
    ...(declaringTargetType === undefined ? {} : { declaringTargetType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
  });
  if (csharpMember === undefined) {
    return rejectTargetPropertyNotRenderable(extensionId, member, declaringTargetType, selectedResultType);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target member property operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
    ...(csharpMember.returnType === undefined ? {} : { resultType: csharpMember.returnType }),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function mapCsharpSourceProfilePropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const identity = getCsharpSourceProfileMemberIdentity(
    getSourceSelectedPropertyDeclaration(request),
    context,
  );
  const member = csharpSourceProfilePropertyMember(identity);
  if (member === undefined) {
    return undefined;
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{
    message: "C# source-profile property operation recorded from TSTS-selected source declaration identity and C# source profile metadata.",
  }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
    ...(member.returnType === undefined ? {} : { resultType: member.returnType }),
  }, [{ message: "C# source-profile property access selected from checked TSTS source declaration identity." }]);
}

function mapSelectedProviderMethodGroupPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.use !== "call-callee") {
    return undefined;
  }
  const selectedEvidence = getSelectedAccessEvidence(request);
  const selectedProviderDeclaration = resolveProviderVirtualDeclaration(context, [
    selectedEvidence.selectedDeclaration,
    selectedEvidence.selectedSymbol,
  ]);
  if (selectedProviderDeclaration?.memberId === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("csharp.provider.method-group-call-callee", "property", "__tsonic_provider_method_group"),
  }, [{ message: "C# provider method-group property access accepted from TSTS-selected provider declaration identity; parent checked call records the selected provider signature fact." }]);
}

function mapSelectedSourceOwnedMethodGroupPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.use !== "call-callee") {
    return undefined;
  }
  const selectedEvidence = getSelectedAccessEvidence(request);
  if (selectedEvidence.selectedSymbol === undefined && selectedEvidence.selectedDeclaration === undefined) {
    return undefined;
  }
  const selectedDeclaration = selectedEvidence.selectedDeclaration;
  if (
    selectedDeclaration === undefined ||
    (context.facts.get(selectedDeclaration, csharpProjectSourceFactKey) === undefined &&
      context.factResolver.resolve(selectedDeclaration, csharpProjectSourceFactKey) === undefined)
  ) {
    return context.phase === "checking" ? deferObservation : undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("csharp.source.method-group-call-callee", "property", "__tsonic_source_method_group"),
  }, [{ message: "C# source-owned method-group property access accepted from TSTS-selected member evidence; parent checked call records the selected source call fact." }]);
}

function mapCsharpSourceProfileMethodGroupPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.use !== "call-callee") {
    return undefined;
  }
  const identity = getCsharpSourceProfileMemberIdentity(getSelectedAccessEvidence(request).selectedDeclaration, context);
  const member = csharpSourceProfileCallMember(identity);
  if (member === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
    ...(member.returnType === undefined ? {} : { resultType: member.returnType }),
  }, [{ message: "C# source-profile method-group property access accepted from TSTS-selected source declaration identity; parent checked call records the selected call fact." }]);
}

function getSourceSelectedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
): ExtensionFactSubject | undefined {
  return getSelectedAccessEvidence(request).selectedDeclaration;
}
