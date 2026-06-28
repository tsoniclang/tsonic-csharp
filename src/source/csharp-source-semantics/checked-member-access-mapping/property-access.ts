import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
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
  targetOperation,
  targetOperationFromMember,
} from "../operations.js";
import {
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
} from "../provider-bindings.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  isAttributeBuilderMemberAccess,
  isAttributeSelectorApplicationTarget,
  isAttributeSelectorBodyExpression,
} from "../source-marker-selectors.js";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";
import {
  mapCsharpNativeArrayCheckedPropertyAccess,
} from "./element-indexer-facts.js";
import {
  mapCsharpObjectShapeCheckedPropertyAccess,
  mapCsharpProjectSourceCheckedPropertyAccess,
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

export function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isAttributeSelectorApplicationTarget(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("source-semantics.attribute-selector.target", "property", "__tsonic_erased_source_marker"),
    }, [{ message: "C# attribute selector target member access was checked by TSTS and marked for fact-driven erasure." }]);
  }
  if (isAttributeSelectorBodyExpression(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("source-semantics.attribute-selector.body", "property", "__tsonic_erased_source_marker"),
    }, [{ message: "C# attribute selector body member access was checked by TSTS and marked for fact-driven erasure." }]);
  }
  if (isAttributeBuilderMemberAccess(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("source-semantics.attribute-builder.member", "property", "__tsonic_erased_source_marker"),
    }, [{ message: "C# attribute builder member access was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
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
    request.receiver,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    selectedDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  );
  if (binding === undefined) {
    return mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ??
      mapCsharpObjectShapeCheckedPropertyAccess(request, context, host) ??
      mapCsharpProjectSourceCheckedPropertyAccess(request, context) ??
      mapCsharpSourceDeclaredReceiverCheckedPropertyAccess(request, context, host) ??
      rejectPropertyAccessNotMapped(extensionId, request.propertyName);
  }
  if (binding.id === dotnetNativeArrayTypeId && request.propertyName === "length") {
    return mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ??
      rejectNativeArrayPropertyNotSupported(extensionId, request.propertyName);
  }
  const selected = selectCheckedPropertyTargetMember(binding, request, context);
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(binding, selected.selectedDeclaration);
  if (unsupportedSelectedMember !== undefined && unsupportedSelectedMember.memberKind !== "event") {
    return rejectTargetPropertyUnsupported(extensionId, unsupportedSelectedMember, binding.id);
  }
  const member = selected.member;
  if (member === undefined) {
    return rejectTargetPropertyNotFound(extensionId, request.propertyName, binding.id);
  }
  if (member.kind === "event") {
    return rejectTargetEventUnsupported(extensionId, member, binding.id, unsupportedSelectedMember);
  }
  if (member.kind === "method" && propertyAccessIsCallCallee(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperationFromMember(member),
    }, [{ message: "C# provider method-group property access accepted from checked TSTS call callee; call emission uses the finalized selected call fact." }]);
  }
  const declaringTargetType = getDeclaringTargetType({ receiver: request.receiver, receiverType: requestContext.receiverType }, context, host);
  const csharpMember = instantiateClosedSelectedTargetMember(member, host, declaringTargetType);
  if (csharpMember === undefined) {
    return rejectTargetPropertyNotRenderable(extensionId, member.id);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target member property operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function propertyAccessIsCallCallee(
  expression: ExtensionFactSubject,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(expression);
  const ast = context.compiler?.ast;
  if (node === undefined || ast === undefined) {
    return false;
  }
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsCallExpression(parent) &&
    asNodeSubject(getNodeField(parent, "Expression")) === node;
}
