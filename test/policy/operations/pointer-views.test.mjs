import assert from "node:assert/strict";
import test from "node:test";
import { tsonicPointerViewFactKey } from "@tsonic/source-core/facts";
import { selectCsharpTypedLocationOperation } from "../../../dist/policy/operations/typed-locations/typed-locations.js";

for (const changed of ["call", "pointerExpression", "readExpression", "writeExpression", "arguments"]) {
  test(`pointer view rejects changed ${changed} before lowering`, () => {
    const call = {};
    const operands = [{}, {}, {}];
    const original = {
      call, pointerExpression: operands[0], readExpression: operands[1], writeExpression: operands[2],
      sourcePointeeType: {}, pointeeType: {}, pointerType: {}, readType: {}, writeType: {},
      resultType: {}, optional: false,
    };
    const fact = changed === "arguments" ? original : { ...original, [changed]: {} };
    const result = selectCsharpTypedLocationOperation({
      ast: { arguments: () => changed === "arguments" ? operands.slice(0, 2) : operands },
      sourceFacts: { getFact: (_subject, key) => key === tsonicPointerViewFactKey ? fact : undefined },
      types: { resolveTypedLocationOperationPointee: () => ({ kind: "source-primitive", name: "float64" }) },
    }, call, {});
    assert.equal(result.kind, "rejected");
    assert.equal(result.operation, "location-view");
    assert.match(result.reason, /exact checked base, read and write/u);
  });
}
