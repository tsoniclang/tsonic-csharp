import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpDictionaryLiteral, CsharpDictionaryLiteralRecords } from "../../../target-model/records/dictionary-literals.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";

export function createCsharpDictionaryLiteralRecords(values: ReadonlyMap<Node, ReadonlyMap<string, CsharpDictionaryLiteral>>): CsharpDictionaryLiteralRecords {
  const selected = new WeakMap<Node, ReadonlyMap<string, CsharpDictionaryLiteral>>();
  for (const [node, carriers] of values) selected.set(node, new Map(carriers));
  return Object.freeze({ dictionaryLiteral: Object.freeze({ get: (node: Node, carrier: TargetTypeRef) => selected.get(node)?.get(targetTypeRefKey(carrier)) }) });
}
