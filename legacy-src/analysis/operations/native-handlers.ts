import type { Node } from "@tsonic/tsts";
import { createTargetClassificationBuilder, createTargetClassificationKey } from "@tsonic/target-api/analysis";
import { selectCsharpNativeHandler } from "../../policy/operations/pointers/native-handlers.js";
import type { CsharpNativeHandler } from "../../target-model/records/native-handlers.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

const nativeHandlerKey = createTargetClassificationKey<CsharpNativeHandler>("csharp.operation.native-handler");

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
  const builder = createTargetClassificationBuilder();
  for (const node of nodes) {
    const selected = selectCsharpNativeHandler(candidates.memoryBinding.get(node), candidates.safetyOperation.get(node),
      candidates.jsStringConversion.get(node), candidates.nativePointer.get(node), candidates.typedLocation.get(node));
    if (selected === undefined) continue;
    requireCsharpRecord(requirements, { family: "nativeHandler", subject: node, construct: selected.kind,
      producer: "analyzeCsharpNativeHandlers" });
    builder.set(node, nativeHandlerKey, selected);
  }
  const records = builder.seal();
  return Object.freeze({ get: (node: Node) => records.get(node, nativeHandlerKey) });
}
