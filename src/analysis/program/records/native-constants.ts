import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeConstantRecords } from "../../../target-model/records/native-constants.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";

export function createCsharpNativeConstantRecords(values: ReadonlyMap<Node, ReadonlyMap<string, boolean>>): CsharpNativeConstantRecords {
  const selected = new WeakMap<Node, ReadonlyMap<string, boolean>>();
  for (const [node, carriers] of values) selected.set(node, new Map(carriers));
  return Object.freeze({ nativeConstant: Object.freeze({ get: (node: Node, carrier: TargetTypeRef) =>
    selected.get(node)?.get(targetTypeRefKey(carrier)) }) });
}
