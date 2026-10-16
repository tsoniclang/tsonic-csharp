import type { CsharpSourceArgumentGroup, CsharpSourceCallArgumentClassification } from "../../../../../target-model/records/operations.js";

export function csharpSourceArgumentGroups(
  classification: CsharpSourceCallArgumentClassification,
): readonly CsharpSourceArgumentGroup[] | undefined {
  const grouping = classification.sourceArgumentGrouping;
  return grouping?.kind === "grouped" ? grouping.groups : undefined;
}
