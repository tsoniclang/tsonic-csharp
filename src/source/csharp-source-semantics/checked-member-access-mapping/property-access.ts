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
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  isDeclarationOrVirtualSourceFile,
} from "../ast-utils/source-file.js";
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
import {
  csharpSourceProfileCallMember,
  csharpSourceProfilePropertyMember,
  getCsharpSourceProfileMemberIdentity,
} from "../source-profile-operations.js";

export function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isDeclarationOnlyPropertyAccess(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("source-declaration.property-access", "property", "__tsonic_declaration_only"),
    }, [{ message: "C# target accepted checked property access inside declaration-only source; backend does not emit declaration-file expressions." }]);
  }
  if (request.sourceSelectedSymbol === undefined && request.sourceSelectedDeclaration === undefined) {
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
  const providerMethodGroup = mapSelectedProviderMethodGroupPropertyAccess(request, context);
  if (providerMethodGroup !== undefined) {
    return providerMethodGroup;
  }
  const sourceOwnedMethodGroup = mapSelectedSourceOwnedMethodGroupPropertyAccess(request, context);
  if (sourceOwnedMethodGroup !== undefined) {
    return sourceOwnedMethodGroup;
  }
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  const binding = findTargetBinding(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclarationContainer,
    requestContext.sourceSelectedDeclaration,
    request.receiver,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    selectedDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  ) ?? findTargetBindingFromResolvedTargetType(
    context,
    [request.receiver],
    host.getTargetTypeRefForSubject,
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
    if (propertyAccessIsCallCallee(request.expression, context)) {
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation("csharp.provider.method-group-call-callee", "property", "__tsonic_provider_method_group"),
      }, [{ message: "C# provider method-group property access was checked as a call callee; the parent checked call must provide selected provider signature facts before emission." }]);
    }
    return rejectTargetPropertyNotFound(extensionId, request.propertyName, targetBinding.id);
  }
  if (member.kind === "event") {
    return rejectTargetEventUnsupported(extensionId, member, targetBinding.id, unsupportedSelectedMember);
  }
  if (member.kind === "method" && propertyAccessIsCallCallee(request.expression, context)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperationFromMember(member),
    }, [{ message: "C# provider method-group property access accepted from checked TSTS call callee; call emission uses the finalized selected call fact." }]);
  }
  const declaringTargetType = getDeclaringTargetType({ receiver: request.receiver }, context, host);
  const selectedResultType = host.getTargetTypeRefForSubject(request.sourceResultType, context);
  const csharpMember = instantiateClosedSelectedTargetMember(member, host, {
    ...(declaringTargetType === undefined ? {} : { declaringTargetType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
  });
  if (csharpMember === undefined) {
    return rejectTargetPropertyNotRenderable(extensionId, member.id);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target member property operation recorded from checked TSTS provider declaration and provider target identity." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(csharpMember),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function mapCsharpSourceProfilePropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const identity = getCsharpSourceProfileMemberIdentity(
    getSourceSelectedPropertyDeclaration(request, context),
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
  }, [{ message: "C# source-profile property access selected from checked TSTS source declaration identity." }]);
}

function mapSelectedProviderMethodGroupPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!propertyAccessIsCallCallee(request.expression, context)) {
    return undefined;
  }
  const selectedProviderDeclaration = resolveProviderVirtualDeclaration(context, [
    request.sourceSelectedDeclaration,
    request.sourceSelectedSymbol,
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
  if (!propertyAccessIsCallCallee(request.expression, context)) {
    return undefined;
  }
  if (request.sourceSelectedSymbol === undefined && request.sourceSelectedDeclaration === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("csharp.source.method-group-call-callee", "property", "__tsonic_source_method_group"),
  }, [{ message: "C# source-owned method-group property access accepted from TSTS-selected member evidence; parent checked call records the selected source call fact." }]);
}

function mapCsharpSourceProfileMethodGroupPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!propertyAccessIsCallCallee(request.expression, context)) {
    return undefined;
  }
  const identity = getCsharpSourceProfileMemberIdentity(request.sourceSelectedDeclaration, context);
  const member = csharpSourceProfileCallMember(identity);
  if (member === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# source-profile method-group property access accepted from TSTS-selected source declaration identity; parent checked call records the selected call fact." }]);
}

function getSourceSelectedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  _context: CheckedPropertyAccessContext,
): ExtensionFactSubject | undefined {
  return asNodeSubject(request.sourceSelectedDeclaration);
}

function isDeclarationOnlyPropertyAccess(
  expression: ExtensionFactSubject,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(expression);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  return isDeclarationOrVirtualSourceFile(compiler.ast.getSourceFile(node), compiler.ast);
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
