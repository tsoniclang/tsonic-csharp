import type { Node } from "@tsonic/tsts";
import type { CsharpSourceCallEmission, CsharpSourceArgumentsEmission, CsharpSourceCallEmissionRecords } from "../../../target-model/records/source-call-emission.js";

export function createCsharpSourceCallEmissionRecords(input: { readonly calls: ReadonlyMap<Node, CsharpSourceCallEmission>;
  readonly arguments: ReadonlyMap<Node, CsharpSourceArgumentsEmission> }): CsharpSourceCallEmissionRecords {
  const calls = new WeakMap<Node, CsharpSourceCallEmission>();
  const arguments_ = new WeakMap<Node, CsharpSourceArgumentsEmission>();
  for (const [node, value] of input.calls) calls.set(node, Object.freeze(value));
  for (const [node, value] of input.arguments) arguments_.set(node, Object.freeze(value));
  return Object.freeze({ sourceCallEmission: Object.freeze({ get: (node: Node) => calls.get(node) }),
    sourceArgumentsEmission: Object.freeze({ get: (node: Node) => arguments_.get(node) }) });
}
