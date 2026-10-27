import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";

export function admitCsharpArrayMutationArguments(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  evidence: CsharpSourceEvidenceIndex): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    const selected = operations.jsArrayMutation.get(node);
    if (selected?.kind !== "set-length") continue;
    const argument = evidence.sourceArgument.get(selected.value);
    const message = argument === undefined ? "C# call planning received an argument without sealed passing evidence."
      : argument.kind === "rejected" ? argument.reason
      : argument.argument.passingMode === "by-value" ? undefined
        : `Finalized argument-passing fact '${argument.argument.passingMode}' does not match the selected call parameter mode 'by-value'.`;
    if (message !== undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: selected.value, message });
  }
  return Object.freeze(issues);
}
