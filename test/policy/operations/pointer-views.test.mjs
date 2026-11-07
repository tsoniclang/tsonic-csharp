import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpTypedLocationOperation } from "../../../dist/analysis/operations/typed-locations.js";

// The pointer view reaches C# as the source-core Host record (K-2662): operand roles with Host descriptors. C# still
// refuses lowering when the record's operands are not the call's own arguments.
for (const changed of ["call", "pointer", "read", "write", "arguments"]) {
  test(`pointer view rejects changed ${changed} before lowering`, () => {
    const call = {};
    const operands = [{}, {}, {}];
    const descriptor = { kind: "intrinsic", intrinsic: "unknown" };
    const original = {
      kind: "resolved", call, source: descriptor, pointee: descriptor, result: descriptor, optional: false,
      pointer: { expression: operands[0], type: descriptor },
      read: { expression: operands[1], type: descriptor },
      write: { expression: operands[2], type: descriptor },
    };
    const record = changed === "arguments" ? original
      : changed === "call" ? { ...original, call: {} }
        : { ...original, [changed]: { expression: {}, type: descriptor } };
    const result = selectCsharpTypedLocationOperation({
      ast: { arguments: () => changed === "arguments" ? operands.slice(0, 2) : operands, typeArguments: () => [] },
      facts: {
        analyses: { extension: () => ({ pointers: { view: () => record } }) },
        values: { type: () => ({ kind: "resolved", type: descriptor }) },
      },
      types: { resolveTypedLocationOperationPointee: () => ({ kind: "source-primitive", name: "float64" }) },
    }, call, {});
    assert.equal(result.kind, "rejected");
    assert.equal(result.operation, "location-view");
    assert.match(result.reason, /exact checked base, read and write/u);
  });
}
