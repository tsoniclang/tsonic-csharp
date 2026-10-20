import type { Node } from "@tsonic/tsts";
import { createCsharpNativeHandlerProducer } from "../program/records/native-handlers.js";
import { selectCsharpNativeHandler } from "../../policy/operations/pointers/native-handlers.js";
import type { CsharpNativeHandler } from "../../target-model/records/native-handlers.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function analyzeCsharpNativeHandlers(
  nodes: readonly Node[],
  candidates: {
    readonly memoryBinding: { readonly get: (node: Node) => Parameters<typeof selectCsharpNativeHandler>[0] };
    readonly safetyOperation: { readonly get: (node: Node) => Parameters<typeof selectCsharpNativeHandler>[1] };
    readonly jsStringConversion: { readonly get: (node: Node) => Parameters<typeof selectCsharpNativeHandler>[2] };
    readonly nativePointer: { readonly get: (node: Node) => Parameters<typeof selectCsharpNativeHandler>[3] };
    readonly typedLocation: { readonly get: (node: Node) => Parameters<typeof selectCsharpNativeHandler>[4] };
  },
  requirements: CsharpRequiredRecord[],
): { readonly get: (node: Node) => CsharpNativeHandler | undefined } {
  const producer = createCsharpNativeHandlerProducer();
  for (const node of nodes) {
    const selected = selectCsharpNativeHandler(candidates.memoryBinding.get(node), candidates.safetyOperation.get(node),
      candidates.jsStringConversion.get(node), candidates.nativePointer.get(node), candidates.typedLocation.get(node));
    if (selected === undefined) continue;
    requireCsharpRecord(requirements, { family: "nativeHandler", subject: node, construct: selected.kind,
      producer: "analyzeCsharpNativeHandlers" });
    producer.selected(node, selected);
  }
  return producer.seal();
}
