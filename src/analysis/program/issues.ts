import type { Node } from "@tsonic/tsts";

import { rejectedTargetStage } from "@tsonic/target-api/artifacts";

import type { TargetStageResult } from "@tsonic/target-api/artifacts";

export function rejectCsharpAnalysisIssues(
  issues: readonly { readonly node?: Node | undefined; readonly code: string; readonly message: string }[],
): TargetStageResult<never> {
  return rejectedTargetStage(issues.map(issue => ({
    code: issue.code,
    category: "error" as const,
    source: "tsonic-csharp",
    message: issue.message,
    sourceNode: issue.node,
  })));
}
