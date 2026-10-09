import assert from "node:assert/strict";
import test from "node:test";
import { getLambdaTargetContext } from "../../../../dist/backend/planner/expressions/expression-lambdas.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";

const number = csharpSourcePrimitiveTargetType("float64");
const physical = csharpDelegateTargetType("System.Action", []);
const contextual = csharpDelegateTargetType("System.Action", [number, number, number]);

function context(node, nativeBody, self = false) {
  return {
    scope: { ...(nativeBody ? { nativeCallableBody: { declaration: node, carrier: physical } } : {}) },
    program: {
      source: { ast: { kindName: () => "KindArrowFunction" } },
      captureStorage: { namedSelf: () => self ? { values: [{}] } : undefined },
      expectedTypes: { callableTarget: () => contextual },
    },
    types: { classifications: { resolveNode: () => physical } },
  };
}

test("a native callable body consumes its sealed physical signature, not its contextual destination", () => {
  const node = {};
  const selected = getLambdaTargetContext(node, {}, context(node, true), undefined, contextual);
  assert.equal(selected?.carrier === physical, true);
  assert.equal(selected?.signature.parameters.length, 0);
});

test("a native callable body without its sealed signature rejects rather than guessing another contract", () => {
  const node = {};
  const input = context(node, true);
  input.scope.nativeCallableBody = { declaration: node };
  assert.equal(getLambdaTargetContext(node, {}, input, undefined, contextual) === undefined, true);
});

test("ordinary contextual lambdas and observed self preserve their existing exact signature owners", () => {
  const node = {};
  assert.equal(getLambdaTargetContext(node, {}, context(node, false), undefined, physical)?.carrier === contextual, true);
  assert.equal(getLambdaTargetContext(node, {}, context(node, false, true), undefined, contextual)?.carrier === physical, true);
  const other = {};
  assert.equal(getLambdaTargetContext(node, {}, context(other, true), undefined, physical)?.carrier === contextual, true,
    "a different declaration cannot impersonate the active native body");
});
