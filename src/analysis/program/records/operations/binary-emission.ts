import type { Node } from "@tsonic/tsts";
import type { CsharpResolvedBinaryOperation } from "../../../../target-model/records/operations/operator-selection.js";
import type { CsharpBinaryEmission, CsharpNativeBinaryEmission, CsharpBinaryEmissionRecords } from "../../../../target-model/records/operations/binary-emission.js";

export function createCsharpBinaryEmissionRecords(forms: ReadonlyMap<Node, CsharpBinaryEmission>,
  native: ReadonlyMap<Node, ReadonlyMap<CsharpResolvedBinaryOperation, CsharpNativeBinaryEmission>>): CsharpBinaryEmissionRecords {
  const forms_ = new WeakMap<Node, CsharpBinaryEmission>();
  const native_ = new WeakMap<Node, ReadonlyMap<CsharpResolvedBinaryOperation, CsharpNativeBinaryEmission>>();
  for (const [node, value] of forms) forms_.set(node, Object.freeze(value));
  for (const [node, values] of native) native_.set(node, new Map([...values].map(([selection, value]) => [selection, Object.freeze(value)])));
  return Object.freeze({ binaryEmission: Object.freeze({ get: (node: Node) => forms_.get(node) }),
    nativeBinaryEmission: Object.freeze({ get: (node: Node, selection: CsharpResolvedBinaryOperation) => native_.get(node)?.get(selection) }) });
}
