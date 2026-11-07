import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { SourceAnalysisFacts } from "@tsonic/target-api/source";

/** The Host property-name selection of a property name node (analyses.propertyName, request R-F5-B1). */
export type CsharpSourcePropertyNameSelection = NonNullable<ReturnType<SourceAnalysisFacts["propertyName"]>>;

/**
 * The .NET refusal for a selected property name that has no static named-field form, at a site that needs a native
 * named field (binding patterns, value carriers, source evidence). The Host selection decides the name (`rejected`
 * with its reason and failure kind, or `unique-symbol`); C# reports only that no native named field exists. Codes and
 * messages are the baseline ones (Q93 option b, Q94).
 */
export function csharpNativePropertyNameIssue(
  sourceNode: Node,
  selection: CsharpSourcePropertyNameSelection,
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
