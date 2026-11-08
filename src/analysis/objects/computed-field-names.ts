import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { SourcePropertyName } from "@tsonic/target-api/source";

export function csharpNativePropertyNameIssue(
  sourceNode: Node,
  selection: SourcePropertyName,
): TargetDiagnostic | undefined {
  if (selection.kind !== "unproven" && selection.kind !== "symbol") return undefined;
  return Object.freeze({
    code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    category: "error",
    source: "tsonic-csharp",
    sourceNode,
    message: selection.kind === "unproven" ? selection.reason
      : "A unique-symbol property can describe an erased type contract but has no static native named-field representation.",
  });
}
