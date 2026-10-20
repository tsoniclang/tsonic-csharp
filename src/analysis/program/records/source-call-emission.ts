import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceCallEmission, CsharpSourceArgumentsEmission, CsharpSourceCallEmissionRecords } from "../../../target-model/records/source-call-emission.js";

export function createCsharpSourceCallEmissionRecords(input: { readonly calls: ReadonlyMap<Node, CsharpSourceCallEmission>;
  readonly arguments: ReadonlyMap<Node, CsharpSourceArgumentsEmission>;
  readonly optional: ReadonlyMap<Node, { readonly optional: boolean; readonly receiver: Node | undefined }>;
  readonly arrays: ReadonlyMap<Node, TargetTypeRef> }): CsharpSourceCallEmissionRecords {
  const calls = new WeakMap<Node, CsharpSourceCallEmission>();
  const arguments_ = new WeakMap<Node, CsharpSourceArgumentsEmission>();
  const optional = new WeakMap<Node, { readonly optional: boolean; readonly receiver: Node | undefined }>();
  const arrays = new WeakMap<Node, TargetTypeRef>();
  for (const [node, value] of input.calls) calls.set(node, Object.freeze(value));
  for (const [node, value] of input.arguments) arguments_.set(node, Object.freeze(value));
  for (const [node, value] of input.optional) optional.set(node, Object.freeze(value));
  for (const [node, value] of input.arrays) arrays.set(node, value);
  return Object.freeze({ sourceCallEmission: Object.freeze({ get: (node: Node) => calls.get(node) }),
    sourceArgumentsEmission: Object.freeze({ get: (node: Node) => arguments_.get(node) }),
    callOptional: Object.freeze({ get: (node: Node) => optional.get(node) }),
    arrayCreationCall: Object.freeze({ get: (node: Node) => arrays.get(node) }) });
}
