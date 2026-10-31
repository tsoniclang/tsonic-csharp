import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeExpressionRecord, CsharpNativeDiscardEmission, CsharpNativeUseRecords } from "../../../../target-model/records/native/native-demand.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpExpressionEmissionRecords(expressions: ReadonlyMap<Node, CsharpNativeExpressionRecord>,
  discards: ReadonlyMap<TargetUseSiteRef, CsharpNativeDiscardEmission>): Pick<CsharpNativeUseRecords, "nativeExpression" | "nativeDiscard"> {
  const expressions_ = new WeakMap<Node, CsharpNativeExpressionRecord>();
  const discards_ = new Map<TargetUseSiteRef, CsharpNativeDiscardEmission>();
  for (const [node, value] of expressions) {
    if (value.discardEvaluation !== "evaluate" && value.discardEvaluation !== "omit")
      failTargetAnalysisInvariant("tsonic-csharp", "Native expression publication requires its exact discard evaluation fact.", node);
    expressions_.set(node, Object.freeze(value));
  }
  for (const [site, value] of discards) discards_.set(site, Object.freeze(value));
  return Object.freeze({ nativeExpression: Object.freeze({ get: (node: Node) => expressions_.get(node) }),
    nativeDiscard: Object.freeze({ get: (site: TargetUseSiteRef) => discards_.get(site) }) });
}
