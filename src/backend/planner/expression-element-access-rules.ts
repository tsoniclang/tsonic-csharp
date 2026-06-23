import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";

export function ensureElementAccessCanBeRendered(
  elementAccess: Node,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): boolean {
  const targetOperation = input.facts.getSelectedTargetElementAccess(elementAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "indexer") {
    return true;
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Element access expected a provider indexer fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return false;
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, elementAccess, "C# element access must be selected by TSTS/provider facts before emission.", ownership);
    return false;
  }
  return true;
}
