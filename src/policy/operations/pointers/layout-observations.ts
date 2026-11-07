import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpSourceCoreAnalyses } from "../../../source/extension/source-core.js";

/** sizeof / alignof / strideof / fieldoffsetof: the exact value of the source-core Host observation record. */
export function selectCsharpLayoutObservation(facts: SourceProgramFacts, node: Node) {
  const selected = csharpSourceCoreAnalyses(facts).memory.observation(node);
  if (selected === undefined) return undefined;
  return selected.kind === "rejected"
    ? Object.freeze({ kind: "rejected" as const, operation: "layout-query" as const, reason: selected.reason })
    : Object.freeze({ kind: "layout-query" as const, value: selected.value });
}
