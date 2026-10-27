import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { CsharpJsValueBoxing, CsharpJsValueBoxingRecords } from "../../../../target-model/records/types/js-value-boxing.js";

export function createCsharpJsValueBoxingProducer() {
  let open = true;
  const values = new WeakMap<Node, Map<string, CsharpJsValueBoxing>>();
  return Object.freeze({
    publish(node: Node, carrier: TargetTypeRef, value: CsharpJsValueBoxing): void {
      const rows = values.get(node) ?? new Map<string, CsharpJsValueBoxing>();
      const key = targetTypeRefKey(carrier);
      if (!open || rows.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "A closed value boxing request has one source producer before sealing.", node);
      rows.set(key, Object.freeze(value));
      values.set(node, rows);
    },
    seal(): CsharpJsValueBoxingRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Closed value boxing plans seal exactly once.");
      open = false;
      return Object.freeze({ jsValueBoxing: Object.freeze({ get: (node: Node, carrier: TargetTypeRef) => values.get(node)?.get(targetTypeRefKey(carrier)) }) });
    },
  });
}
