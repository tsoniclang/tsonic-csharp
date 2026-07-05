import {
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
    : lifecycleContext.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
      lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(receiver, createRuntimeCarrierLifecycleObservationContext(lifecycleContext));
  if (receiverTargetType?.kind !== "target-named") {
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
  if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
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
  const selectedMember = csharpTargetMemberFact(selectedSignature.member);
  if (selectedMember === undefined || selectedMember.receiverPassing === "first-argument") {
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
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(member, {
      ...(selectedSignature.targetTypeArguments === undefined ? {} : { typeArguments: selectedSignature.targetTypeArguments }),
    }),
    [{ message: "C# selected call operation finalized from closed TSTS selected target signature." }],
  );
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
  for (const subject of [selectedSignature.sourceDeclaration, selectedSignature.sourceSignature]) {
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
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsCallExpression(node)) {
    return member.declaringType;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined || !compiler.ast.is.IsPropertyAccessExpression(expression)) {
    return member.declaringType;
  }
  const receiver = asNodeSubject(getNodeField(expression, "Expression"));
  if (receiver === undefined) {
    return member.declaringType;
  }
  return lifecycleContext.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
    lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    member.declaringType;
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
}
