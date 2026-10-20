import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeHandler } from "../../../target-model/records/native-handlers.js";

export function createCsharpNativeHandlerProducer() {
  const values = new WeakMap<Node, CsharpNativeHandler>();
  const reader = Object.freeze({ get: (node: Node) => values.get(node) });
  let closed = false;
  return Object.freeze({
    selected(node: Node, value: CsharpNativeHandler): void {
      if (closed || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp",
        "A native handler has one pre-seal producer.", node);
      values.set(node, Object.freeze(value));
    },
    seal() {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native handler records seal exactly once.");
      closed = true;
      return reader;
    },
  });
}
