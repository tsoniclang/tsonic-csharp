import type { Node } from "@tsonic/tsts";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/conversions.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function sealCsharpConversionUses(
  demand: CsharpNativeDemandAnalysis,
  classify: (expression: Node, source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode) =>
    { readonly key: string; readonly classification: CsharpExpressionConversionClassification } | undefined,
  requiredRecords: CsharpRequiredRecord[],
): {
  readonly expressions: Map<Node, Map<string, CsharpExpressionConversionClassification>>;
  readonly issues: readonly CsharpConversionIssue[];
} {
  const expressions = new Map<Node, Map<string, CsharpExpressionConversionClassification>>();
  const issues: CsharpConversionIssue[] = [];
  for (const entry of demand.entries) {
    const use = entry.use;
    if (use.kind === "erased" || use.completion.kind !== "value") continue;
    const source = use.kind === "converted" && use.input.kind === "value" ? use.input.type : use.carrier;
    const target = use.kind === "converted" ? use.target : use.carrier;
    const mode = use.kind === "converted" ? use.mode : "implicit";
    const admitted = classify(use.expression, source, target, mode);
    if (admitted === undefined) {
      issues.push(Object.freeze({ node: use.expression, code: "CSHARP_UNSUPPORTED_AST",
        message: "A consumed native expression requires one exact completed conversion classification." }));
      continue;
    }
    const selections = expressions.get(use.expression) ?? new Map();
    selections.set(admitted.key, admitted.classification);
    expressions.set(use.expression, selections);
    if (admitted.classification.selection.kind === "rejected") {
      issues.push(Object.freeze({ node: use.expression, code: "CSHARP_UNSUPPORTED_AST",
        message: admitted.classification.selection.reason }));
      continue;
    }
    requireCsharpRecord(requiredRecords, { family: "conversion", subject: use.expression, source, target, mode,
      construct: "consumed native carrier conversion", producer: "sealCsharpConversionUses" });
    requireCsharpRecord(requiredRecords, { family: "expressionConversion", subject: use.expression, source, target, mode,
      construct: "consumed native expression conversion", producer: "sealCsharpConversionUses" });
  }
  return Object.freeze({ expressions, issues: Object.freeze(issues) });
}
