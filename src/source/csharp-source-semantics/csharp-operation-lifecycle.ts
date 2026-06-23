import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SelectedTargetSignatureFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
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
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
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
  const selectedSignature = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey);
  if (selectedSignature === undefined) {
    return;
  }
  const declaringTargetType = getSelectedCallDeclaringTargetType(lifecycleContext, node, selectedSignature);
  const member = instantiateSelectedTargetMember(selectedSignature, host, { declaringTargetType });
  if (member === undefined || !targetMemberIsClosed(member)) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    selectedTargetSignatureFactKey,
    { member },
    [{ message: "C# selected target signature finalized from checked provider call and provider target identity." }],
  );
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(member),
    [{ message: "C# selected call operation finalized from closed TSTS selected target signature." }],
  );
}

function getSelectedCallDeclaringTargetType(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSignature: SelectedTargetSignatureFact,
): TargetTypeRef | undefined {
  const member = selectedSignature.member;
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
  return lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    member.declaringType;
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
}
