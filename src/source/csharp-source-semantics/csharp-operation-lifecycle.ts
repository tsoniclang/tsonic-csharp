import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getStructuralChildNodes,
} from "./ast-utils.js";
import {
  csharpTargetOperationFromMember,
} from "./operations.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";

export function recordCsharpSelectedCallOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkSelectedCallOperationFacts(lifecycleContext, sourceFile);
  }
}

function walkSelectedCallOperationFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node | undefined,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  for (const child of getCsharpOperationChildNodes(compiler.ast, node)) {
    walkSelectedCallOperationFacts(lifecycleContext, child);
  }
  if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
  }
  const selectedSignature = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey);
  if (selectedSignature === undefined) {
    return;
  }
  const member = instantiateSelectedTargetMember(selectedSignature);
  if (member === undefined) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(member),
    [{ message: "C# selected call operation finalized from closed TSTS selected target signature." }],
  );
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set([
    ...ast.children(node),
    ...ast.typeArguments(node),
    ...ast.typeParameters(node),
    ...ast.parameters(node),
    ...ast.members(node),
    ...ast.elements(node),
    ...ast.properties(node),
    ...ast.arguments(node),
    ...getStructuralChildNodes(node),
  ]));
}
