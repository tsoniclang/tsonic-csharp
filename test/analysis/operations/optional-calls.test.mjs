import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpOptionalCallReceiver } from "../../../dist/analysis/operations/optional-calls.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional invocation classifies the evaluated receiver rather than its already-present member type", () => {
  const expression = {};
  const access = {};
  const present = csharpSourcePrimitiveTargetType("int32");
  const storage = csharpNullableTargetType(present);
  const source = { call: {}, optionalChain: true, sourceReceiver: { expression, type: {} },
    sourceCalleeAccess: { expression: access } };
  const policy = { ast: { as: { AsCallExpression: () => ({}),
    AsPropertyAccessExpression: () => ({ QuestionDotToken: {} }), AsElementAccessExpression: () => undefined } },
    types: { resolveNode: subject => { assert.equal(subject === expression, true); return storage; },
      resolveSelectedValue: () => assert.fail("Member-present type is not evaluated receiver storage") } };
  const selected = classifyCsharpOptionalCallReceiver(policy, source, undefined, {});
  assert.equal(selected?.expression === expression, true);
  assert.equal(selected?.storage === storage, true);
  assert.equal(targetTypeRefEquals(selected?.type, present), true);
  assert.equal(selected?.guard, true);
  const unresolved = { ...policy, types: { ...policy.types, resolveNode: () => undefined } };
  assert.equal(classifyCsharpOptionalCallReceiver(unresolved, source, undefined, {}) === undefined, true);
});
