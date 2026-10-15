import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpDelegateTargetType, csharpNullableTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} }, target: {} };
const number = csharpSourcePrimitiveTargetType("float64");
const optional = csharpNullableTargetType(number);
const callable = (parameters, result = number, optionalParameterIndexes = []) => csharpDelegateTargetType(
  "System.Func", parameters, result,
  { optionalParameterIndexes },
);

test("native callable conversions use contravariant carriers, not optional metadata equality", () => {
  for (const [source, target] of [[callable([]), callable([optional], number, [0])],
    [callable([optional], number, [0]), callable([number])]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "delegate-adapter");
  }
  for (const [source, target] of [[callable([number]), callable([optional], number, [0])],
    [callable([number]), callable([])],
    [callable([]), callable([], csharpSourcePrimitiveTargetType("bool"))]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected");
  }
});

test("discarding a native callable result cannot invent a required value", () => {
  const action = csharpDelegateTargetType("System.Action", []);
  const discard = selectCsharpConversion(policy, callable([]), action, "implicit");
  assert.equal(discard.kind, "delegate-adapter");
  assert.deepEqual(discard.returnConversion, { kind: "void-return" });
  assert.equal(selectCsharpConversion(policy, action, callable([]), "implicit").kind, "rejected");
});
