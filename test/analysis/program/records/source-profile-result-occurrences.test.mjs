import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourceProfileInputs } from "../../../helpers/planning-records.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

// Basis (nextgen C-2542, signed by Claude): profile inputs read published descriptors only. A call result is the
// represented `selection.result` at the call; a property or index result is the represented `values.type` of the
// operation node. Results stay keyed by the exact operation occurrence even when the published descriptors coincide.
test("profile call property and index results are keyed by their exact operation occurrence even when published descriptors coincide", () => {
  const descriptor = Object.freeze({ kind: "primitive", primitive: "int32" });
  const operations = [
    { kind: "call", node: {}, carrier: csharpSourcePrimitiveTargetType("int32") },
    { kind: "property", node: {}, carrier: csharpSourcePrimitiveTargetType("int64") },
    { kind: "index", node: {}, carrier: csharpSourcePrimitiveTargetType("float32") },
  ];
  const selection = Object.freeze({ use: operations[0].node, kind: "call", callee: {}, signature: {}, overloadIndex: 0,
    arguments: [], parameters: [], result: descriptor, optionalChain: false });
  const call = Object.freeze({ call: operations[0].node, selection, arguments: [], parameters: [], bindings: [], typeArguments: [] });
  const reads = [];
  const host = { types: {
    represent(type, occurrence, position) {
      assert.equal(type === descriptor && occurrence === call.call && position === "value", true,
        "the call result is the published selection result at the exact call");
      reads.push(occurrence);
      return operations[0].carrier;
    },
    value(node) {
      const selected = operations.find(operation => operation.node === node);
      assert.equal(selected !== undefined && selected.kind !== "call", true, "only the exact access reads its published value");
      reads.push(node);
      return selected.carrier;
    },
  } };
  for (const operation of operations) {
    const inputs = csharpSourceProfileInputs(host, { operation: operation.node, ...(operation.kind === "call" ? { call } : {}) });
    assert.equal(inputs.results.get(operation.node) === operation.carrier, true, "the real input producer publishes the exact operation's Native result");
    for (const foreign of [descriptor, {}, ...operations.filter(row => row !== operation).map(row => row.node)]) {
      assert.equal(inputs.results.get(foreign) === undefined, true, "neither a shared descriptor nor another operation can select this result");
    }
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, "types"), false, "no Type-keyed result channel exists");
  }
  assert.equal(reads.length === 3 && reads.every((node, index) => node === operations[index].node), true,
    "each exact result owner is queried once in the original operation order");
});

test("Source-profile fixture packets reject a missing operation instead of choosing one", () => {
  assert.throws(() => csharpSourceProfileInputs({}, { result: {} }), /exact operation occurrence/u);
});
