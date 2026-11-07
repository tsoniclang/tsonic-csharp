import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpOptionalCallReceiver } from "../../../dist/analysis/operations/optional-calls.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional invocation classifies the evaluated receiver rather than its already-present member type", () => {
  const expression = {};
  const access = {};
  const present = csharpSourcePrimitiveTargetType("int32");
  const storage = csharpNullableTargetType(present);
  const source = { use: {}, callee: access, optionalChain: true, receiver: expression };
  const policy = { ast: { as: { AsCallExpression: () => ({}),
    AsPropertyAccessExpression: () => ({ QuestionDotToken: {} }), AsElementAccessExpression: () => undefined } },
    types: { readStorage: subject => { assert.equal(subject === expression, true); return storage; },
      value: () => assert.fail("Member-present type is not evaluated receiver storage") } };
  const selected = classifyCsharpOptionalCallReceiver(policy, source, undefined, []);
  assert.equal(selected?.expression === expression, true);
  assert.equal(selected?.storage === storage, true);
  assert.equal(targetTypeRefEquals(selected?.type, present), true);
  assert.equal(selected?.guard, true);
  // A refused receiver storage is reported here with its own code and site (R4 #35); the optional receiver is then not
  // classified.
  const refused = { ...policy, types: { ...policy.types, readStorage: () => ({ kind: "csharp-refused", code: "CSHARP_UNION_ARITY", message: "no arity", site: expression }) } };
  const issues = [];
  assert.equal(classifyCsharpOptionalCallReceiver(refused, source, undefined, issues) === undefined, true);
  assert.deepEqual(issues, [{ node: expression, code: "CSHARP_UNION_ARITY", message: "no arity" }]);
});
