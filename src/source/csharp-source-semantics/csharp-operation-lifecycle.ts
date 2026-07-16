import {
  argumentPassingFactKey,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SelectedTargetSignatureFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpByrefStorageFactKey,
  csharpSelectedCallTargetFactKey,
  csharpSelectedPropertyTargetFactKey,
  csharpSourceReturnCarrierFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getAstReaderChildNodes,
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  csharpTargetOperationFromMember,
} from "./operations.js";
import {
  csharpNullableReferenceTargetType,
  csharpTargetMemberFact,
  csharpTargetBindingFact,
} from "./target-types.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "./source-owned-selected-signature.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  targetTypeRefEquals,
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  getCsharpJsSourceLibraryDeferredPropertyMemberForOperation,
} from "./surfaces/js/properties/member-providers/index.js";
import {
  getCsharpArrayBoundaryCoreCarrier,
} from "./surfaces/js/array-boundary-facts.js";

type CsharpFinalizedCallOperationHost = CsharpTargetTypeResolutionHost & CsharpOperationsProviderHost;

export function recordCsharpSelectedCallOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkSelectedCallOperationFacts(lifecycleContext, sourceFile, host);
  }
}

export function recordCsharpSelectedPropertyOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkSelectedPropertyOperationFacts(lifecycleContext, sourceFile, host);
  }
}

function walkSelectedPropertyOperationFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node | undefined,
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  for (const child of getCsharpOperationChildNodes(compiler.ast, node)) {
    walkSelectedPropertyOperationFacts(lifecycleContext, child, host);
  }
  if (!compiler.ast.is.IsPropertyAccessExpression(node) || lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
  }
  const operation = lifecycleContext.host.facts.get(node, targetOperationFactKey) ??
    lifecycleContext.host.factResolver.resolve(node, targetOperationFactKey);
  if (operation?.operationKind !== "property") {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const receiverTargetType = receiver === undefined
    ? undefined
    : getCsharpArrayBoundaryCoreCarrier(receiver, lifecycleContext.host) ??
      lifecycleContext.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
      lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(receiver, createRuntimeCarrierLifecycleObservationContext(lifecycleContext));
  if (receiverTargetType === undefined) {
    return;
  }
  const selectedPropertyTarget = lifecycleContext.host.facts.get(node, csharpSelectedPropertyTargetFactKey) ??
    lifecycleContext.host.factResolver.resolve(node, csharpSelectedPropertyTargetFactKey);
  if (selectedPropertyTarget !== undefined) {
    const selectedMember = getCsharpJsSourceLibraryDeferredPropertyMemberForOperation(
      selectedPropertyTarget.operationId,
      receiverTargetType,
    );
    if (selectedMember === undefined || !targetMemberIsClosed(selectedMember)) {
      return;
    }
    lifecycleContext.host.facts.set(
      node,
      csharpTargetOperationFactKey,
      csharpTargetOperationFromMember(selectedMember),
      [{ message: "C# selected JS property operation finalized from TSTS-selected source identity and finalized receiver carrier facts." }],
    );
    return;
  }
  if (receiverTargetType.kind !== "target-named") {
    return;
  }
  const binding = csharpTargetBindingFact(host.getCsharpTargetBindingByTargetId(receiverTargetType.id));
  const member = binding?.members?.find((memberFact) => memberFact.id === operation.operationId);
  if (member === undefined || (member.kind !== "property" && member.kind !== "field")) {
    return;
  }
  const selectedMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType: receiverTargetType });
  if (selectedMember === undefined || !targetMemberIsClosed(selectedMember)) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(selectedMember),
    [{ message: "C# selected property operation finalized from checked TSTS target operation and finalized receiver carrier facts." }],
  );
}

function walkSelectedCallOperationFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node | undefined,
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  for (const child of getCsharpOperationChildNodes(compiler.ast, node)) {
    walkSelectedCallOperationFacts(lifecycleContext, child, host);
  }
  const selectedSignature = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey) ??
    lifecycleContext.host.factResolver.resolve(node, selectedTargetSignatureFactKey);
  if (selectedSignature === undefined) {
    return;
  }
  if (isCsharpSourceOwnedSelectedSignature(selectedSignature)) {
    recordSourceOwnedCallReturnCarrierFact(lifecycleContext, node, selectedSignature);
    return;
  }
  recordSelectedCallByrefStorageFacts(lifecycleContext, node, csharpTargetMemberFact(selectedSignature.member));
  if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
  }
  const selectedCallTarget = lifecycleContext.host.facts.get(node, csharpSelectedCallTargetFactKey) ??
    lifecycleContext.host.factResolver.resolve(node, csharpSelectedCallTargetFactKey);
  const selectedMember = selectedCallTarget?.member ?? csharpTargetMemberFact(selectedSignature.member);
  if (selectedMember === undefined) {
    return;
  }
  if (selectedMember.receiverPassing === "first-argument" && selectedCallTarget === undefined) {
    return;
  }
  const declaringTargetType = getSelectedCallDeclaringTargetType(lifecycleContext, node, selectedMember);
  const member = instantiateSelectedTargetMember({
    member: selectedMember,
    ...(selectedSignature.targetTypeArguments === undefined ? {} : { targetTypeArguments: selectedSignature.targetTypeArguments }),
  }, host, { declaringTargetType });
  if (member === undefined || !targetMemberIsClosed(member)) {
    return;
  }
  if (!selectedFirstArgumentReceiverIsClosed(lifecycleContext, node, member, host)) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(member, {
      ...(selectedSignature.targetTypeArguments === undefined ? {} : { typeArguments: selectedSignature.targetTypeArguments }),
    }),
    [{ message: "C# selected call operation finalized from closed TSTS selected target signature." }],
  );
}

function recordSelectedCallByrefStorageFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSourceMember: ReturnType<typeof csharpTargetMemberFact>,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || selectedSourceMember === undefined || !compiler.ast.is.IsCallExpression(node)) {
    return;
  }
  const arguments_ = compiler.ast.arguments(node);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = asNodeSubject(arguments_[index]);
    const parameter = selectedSourceMember.parameters[index];
    if (argument === undefined || parameter === undefined || parameter.passingMode === "by-value") {
      continue;
    }
    const passing = lifecycleContext.host.facts.get(argument, argumentPassingFactKey) ??
      lifecycleContext.host.factResolver.resolve(argument, argumentPassingFactKey);
    const targetExpression = asNodeSubject(passing?.targetExpression);
    if (
      passing === undefined ||
      targetExpression === undefined ||
      passing.mode !== parameter.passingMode ||
      (passing.parameterIndex !== undefined && passing.parameterIndex !== index)
    ) {
      continue;
    }
    const targetType = parameter.csharpOutputMayBeNull === true
      ? csharpNullableReferenceTargetType(parameter.type)
      : parameter.type;
    lifecycleContext.host.facts.set(
      targetExpression,
      csharpByrefStorageFactKey,
      { targetType },
      [{ message: "C# byref storage type finalized from the exact TSTS-selected target parameter and argument-passing facts." }],
    );
  }
}

function selectedFirstArgumentReceiverIsClosed(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  member: NonNullable<ReturnType<typeof csharpTargetMemberFact>>,
  host: CsharpFinalizedCallOperationHost,
): boolean {
  if (member.receiverPassing !== "first-argument") {
    return true;
  }
  const receiver = getSelectedCallReceiver(lifecycleContext, node);
  const receiverParameter = member.parameters[0];
  if (receiver === undefined || receiverParameter === undefined) {
    return false;
  }
  const receiverCarrier = lifecycleContext.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
    lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier;
  if (receiverCarrier === undefined) {
    return false;
  }
  return targetTypeRefEquals(receiverCarrier, receiverParameter.type) ||
    (host.getAssignableTargetTypeRefs?.(receiverCarrier) ?? [])
      .some((candidate) => targetTypeRefEquals(candidate, receiverParameter.type));
}

function recordSourceOwnedCallReturnCarrierFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSignature: SelectedTargetSignatureFact,
): void {
  if (lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const carrier = getSourceReturnCarrierForSelectedSignature(lifecycleContext, selectedSignature);
  if (carrier === undefined) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, { carrier }, [{
    message: "C# source-owned call return carrier finalized from TSTS-selected source declaration return facts.",
  }]);
}

function getSourceReturnCarrierForSelectedSignature(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  selectedSignature: SelectedTargetSignatureFact,
): TargetTypeRef | undefined {
  for (const subject of [
    selectedSignature.sourceDeclaration,
    selectedSignature.sourceSignature,
    selectedSignature.sourceSelectedCalleeDeclaration,
    selectedSignature.sourceSelectedCalleeSymbol,
  ]) {
    if (subject === undefined) {
      continue;
    }
    const carrier = lifecycleContext.host.facts.get(subject, csharpSourceReturnCarrierFactKey)?.carrier ??
      lifecycleContext.host.factResolver.resolve(subject, csharpSourceReturnCarrierFactKey)?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}

function getSelectedCallDeclaringTargetType(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  member: ReturnType<typeof csharpTargetMemberFact>,
): TargetTypeRef | undefined {
  if (member === undefined) {
    return undefined;
  }
  if (member.kind === "constructor" || member.static === true) {
    return member.declaringType;
  }
  const receiver = getSelectedCallReceiver(lifecycleContext, node);
  if (receiver === undefined) {
    return member.declaringType;
  }
  return lifecycleContext.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
    lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    member.declaringType;
}

function getSelectedCallReceiver(
  lifecycleContext: { readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
): Node | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsCallExpression(node)) {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined || !compiler.ast.is.IsPropertyAccessExpression(expression)) {
    return undefined;
  }
  return asNodeSubject(getNodeField(expression, "Expression"));
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
}
