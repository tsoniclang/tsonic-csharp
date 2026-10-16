import assert from "node:assert/strict";
import test from "node:test";
import { getLambdaTargetContext } from "../../../../dist/backend/planner/expressions/expression-lambdas.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

const number = csharpSourcePrimitiveTargetType("float64");
const physical = csharpDelegateTargetType("System.Action", []);
const contextual = csharpDelegateTargetType("System.Action", [number, number, number]);

function context(node, nativeBody, self = false) {
  return {
    scope: { ...(nativeBody ? { nativeCallableBody: { declaration: node, carrier: physical } } : {}) },
    program: { source: { ast: { kindName: () => "KindArrowFunction" } },
      records: { namedSelf: { get: () => self ? { values: [{}] } : undefined },
        callableTarget: { get: () => self ? physical : contextual } } },
    types: { classifications: { resolveNode: () => assert.fail("the planner never chooses creation from node metadata") } },
  };
}

test("a native callable body consumes its sealed physical signature, not its contextual destination", () => {
  const node = {};
  const selected = getLambdaTargetContext(node, context(node, true));
  assert.equal(selected?.carrier === physical, true);
  assert.equal(selected?.signature.parameters.length, 0);
});

test("a native callable body without its sealed signature rejects rather than guessing another contract", () => {
  const node = {};
  const input = context(node, true);
  input.scope.nativeCallableBody = { declaration: node };
  assert.equal(getLambdaTargetContext(node, input) === undefined, true);
});

test("ordinary contextual lambdas and observed self preserve their existing exact signature owners", () => {
  const node = {};
  assert.equal(getLambdaTargetContext(node, context(node, false))?.carrier === contextual, true);
  assert.equal(getLambdaTargetContext(node, context(node, false, true))?.carrier === physical, true);
  const other = {};
  assert.equal(getLambdaTargetContext(node, context(other, true))?.carrier === contextual, true,
    "a different declaration cannot impersonate the active native body");
});
