import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { SourcePropertyNameSelection } from "@tsonic/target-api/source";

export function csharpNativePropertyNameIssue(
  sourceNode: Node,
  selection: SourcePropertyNameSelection,
): TargetDiagnostic | undefined {
  if (selection.kind !== "rejected" && selection.kind !== "unique-symbol") return undefined;
  return Object.freeze({
    code: selection.kind === "rejected" && selection.failure === "resource"
      ? "CSHARP_ENUM_CONSTANT_RESOURCE_LIMIT" : "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    category: "error",
    source: "tsonic-csharp",
    sourceNode,
    message: selection.kind === "rejected" ? selection.reason
      : "A unique-symbol property can describe an erased type contract but has no static native named-field representation.",
  });
}
