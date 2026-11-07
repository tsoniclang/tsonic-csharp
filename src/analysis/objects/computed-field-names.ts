import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { SourceAnalysisFacts } from "@tsonic/target-api/source";

/** The Host property-name selection of a property name node (analyses.propertyName, request R-F5-B1). */
export type CsharpSourcePropertyNameSelection = NonNullable<ReturnType<SourceAnalysisFacts["propertyName"]>>;

/**
 * The .NET refusal for a selected property name that has no static named-field form. A Host property-name refusal
 * (dynamic or effectful computed keys, enum-constant limits) is forwarded before C# analysis and never reaches here.
 */
export function csharpNativePropertyNameIssue(
  sourceNode: Node,
  selection: CsharpSourcePropertyNameSelection,
): TargetDiagnostic | undefined {
  if (selection.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
    "A property name is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", sourceNode);
  if (selection.kind !== "unique-symbol") return undefined;
  return Object.freeze({
    code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    category: "error",
    source: "tsonic-csharp",
    sourceNode,
    message: "A unique-symbol property can describe an erased type contract but has no static native named-field representation.",
  });
}
