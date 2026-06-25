import {
  acceptObservation,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  csharpTargetMemberOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  sourceOwnedPropertyOperation,
  targetOperation,
  targetOperationFromMember,
} from "./operations.js";
import {
  findTargetBinding,
} from "./provider-bindings.js";
import {
  isAttributeBuilderMemberAccess,
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
  findTargetMemberForElementAccess,
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import {
  findUnsupportedProviderTargetMember,
} from "./provider-unsupported-members.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  asNodeSubject,
  isDeclarationOrVirtualSourceFile,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
} from "../../providers/dotnet/native-array.js";

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
    return mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ??
      mapCsharpObjectShapeCheckedPropertyAccess(request, context, host) ??
      mapCsharpProjectSourceCheckedPropertyAccess(request, context) ??
      rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED", 9100144, `C# property access '${request.propertyName}' must be selected by TSTS/provider facts before emission.`));
  }
  if (binding.id === dotnetNativeArrayTypeId) {
    return mapCsharpNativeArrayCheckedPropertyAccess(request, context, extensionId, host) ?? deferObservation;
  }
  const selectedDeclarationFact = context.facts.get(request.sourceSelectedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  const member = findTargetMember(binding, selectedDeclarationFact);
  if (member === undefined) {
    const unsupportedMember = findUnsupportedProviderTargetMember(binding, selectedDeclarationFact);
    if (unsupportedMember !== undefined) {
      return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_UNSUPPORTED", 9100131, `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${binding.id}'. ${unsupportedMember.reason}`));
    }
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_FOUND", 9100102, `C# provider could not map checked property '${request.propertyName}' on target '${binding.id}'.`));
  }
  if (member.kind === "event") {
    const unsupportedMember = findUnsupportedProviderTargetMember(binding, selectedDeclarationFact);
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_EVENT_UNSUPPORTED", 9100132, `C# provider selected event '${member.targetName}' on target '${binding.id}', but source event subscription semantics are not modeled.${unsupportedMember === undefined ? "" : ` ${unsupportedMember.reason}`}`));
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

function mapCsharpProjectSourceCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const selectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration);
  const compiler = context.compiler;
  if (selectedDeclaration === undefined || compiler === undefined) {
    return undefined;
  }
  const declarationSourceFile = compiler.ast.getSourceFile(selectedDeclaration);
  if (isDeclarationOrVirtualSourceFile(declarationSourceFile, compiler.ast)) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: sourceOwnedPropertyOperation(request.propertyName),
  }, [{ message: "C# source-owned property access accepted from TSTS-selected project source declaration; backend renders source syntax without provider target-member facts." }]);
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
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ??
      rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_ELEMENT_ACCESS_NOT_MAPPED", 9100145, "C# element access must be selected by TSTS/provider facts before emission."));
  }
  if (binding.id === dotnetNativeArrayTypeId) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId, host) ?? deferObservation;
  }
  const virtualDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  const declaringTargetType = host.getTargetTypeRefForSubject(request.receiverType, context) ??
    host.getTargetTypeRefForSubject(request.receiver, context);
  const member = findTargetMemberForElementAccess(
    binding,
    virtualDeclaration,
    request,
    context,
    host.getTargetTypeRefForSubject,
    {
      getBaseTargetTypeRef: host.getBaseTargetTypeRef,
      ...(declaringTargetType !== undefined ? { declaringTargetType } : {}),
      ...(binding.typeParameters !== undefined ? { declaringTypeParameters: binding.typeParameters } : {}),
    },
  );
  if (member === undefined) {
    const unsupportedMember = findUnsupportedProviderTargetMember(binding, virtualDeclaration);
    if (unsupportedMember !== undefined) {
      return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_UNSUPPORTED", 9100133, `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${binding.id}'. ${unsupportedMember.reason}`));
    }
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider could not map checked element access on target '${binding.id}' from selected TSTS provider index declaration identity.`));
  }
  if (member.kind !== "indexer") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider selected non-indexer member '${member.id}' for checked element access on target '${binding.id}'.`));
  }
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
  if (isNamespaceImportReceiver(request.receiver, context)) {
    return undefined;
  }
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

function isNamespaceImportReceiver(
  receiver: unknown,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const receiverNode = asNodeSubject(receiver);
  if (ast === undefined || receiverNode === undefined || !ast.is.IsIdentifier(receiverNode)) {
    return false;
  }
  const sourceFile = ast.getSourceFile(receiverNode);
  const receiverName = ast.text(receiverNode);
  if (sourceFile === undefined) {
    return false;
  }
  let matched = false;
  visitAstReaderNodes(ast, sourceFile, (node) => {
    if (matched || !ast.is.IsImportDeclaration(node)) {
      return;
    }
    const importDeclaration = ast.as.AsImportDeclaration(node);
    const importClause = ast.as.AsImportClause(importDeclaration?.ImportClause);
    const namedBindings = importClause?.NamedBindings;
    if (namedBindings === undefined || ast.as.AsNamespaceImport(namedBindings) === undefined) {
      return;
    }
    const name = ast.name(namedBindings);
    matched = name !== undefined && ast.text(name) === receiverName;
  });
  return matched;
}

function mapCsharpNativeArrayCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
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
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${request.propertyName}'. JavaScript array properties require an explicit selected surface carrier.`));
  }
  const selectedDeclarationFact = context.facts.get(request.sourceSelectedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  const member = findTargetMember(binding, selectedDeclarationFact);
  if (member?.id !== dotnetNativeArrayLengthMemberId) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${request.propertyName}'.`));
  }
  const operation = csharpTargetOperationFromMember(member);
  recordCsharpTargetOperation(context, request.expression, operation, [{ message: "C# native array length operation recorded from checked TypeScript property access on provider-owned array contract." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(dotnetNativeArrayLengthMemberId, "property", "System.Array.Length", {
      resultType: csharpSourcePrimitiveTargetType("int32"),
    }),
  }, [{ message: "C# native array length selected from checked TypeScript property access on provider-owned array contract." }]);
}

function mapCsharpNativeArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
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
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, "C# native array element access requires the selected provider-owned native array indexer declaration."));
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100109, "C# native array element access requires an integral TSTS/provider-backed index type."));
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

function getNativeArrayReceiverType(
  receiverTypeSubject: ExtensionFactSubject | undefined,
  receiverSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(receiverTypeSubject, context, noRuntimeCarrierQuery) ??
      host.getTargetTypeRefForSubject(receiverSubject, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }),
  );
}
