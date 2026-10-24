import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpIteration } from "../../../../dist/analysis/operations/iteration/selection.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const array = { kind: "array", element: integer };
const source = (iterationKind, mechanism) => ({ iterationKind, mechanism: { kind: mechanism } });
function select(iteration, carrier, expression = {}) {
  return selectCsharpIteration({ semantics: () => ({ operations: { iteration: () => iteration } }),
    types: { resolveNode: () => carrier === undefined ? undefined : { kind: "resolved", type: carrier } } }, {}, expression, {});
}

test("C# native iteration retains foreach and its explicit async adapter forms", () => {
  for (const [iterationKind, mechanism, lowering] of [
    ["for-of", "array-like-index", "foreach"],
    ["for-await-of", "asynchronous-iterator-protocol", "await-foreach"],
    ["for-await-of", "synchronous-iterator-adapted-to-async", "await-foreach-sync-adapter"],
    ["for-await-of", "array-like-index-adapted-to-async", "await-foreach-sync-adapter"],
  ]) {
    const selectedSource = source(iterationKind, mechanism);
    const selected = select(selectedSource, array);
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.source === selectedSource, true, "the exact checked mechanism is preserved");
    assert.equal(selected.iterableType === array && selected.elementType === integer, true, "native carrier identity is preserved");
    assert.deepEqual(selected.lowering, { kind: lowering });
  }
});

test("C# strings retain their native code-point policy for synchronous and adapted iteration", () => {
  const string = csharpStringTargetType();
  for (const [iterationKind, mechanism] of [["for-of", "string-code-unit-index"],
    ["for-await-of", "string-code-unit-index-adapted-to-async"], ["for-await-of", "synchronous-iterator-adapted-to-async"]]) {
    const selected = select(source(iterationKind, mechanism), string);
    assert.equal(selected.kind, "resolved");
    assert.deepEqual(selected.lowering, { kind: "string-code-point", policy: string.csharpStringIteration });
  }
});

test("C# iteration preserves missing-evidence and unsupported async-mechanism rejections", () => {
  assert.equal(selectCsharpIteration({}, {}, undefined, {}).kind, "rejected");
  assert.equal(select(undefined, array).kind, "rejected");
  assert.equal(select(source("for-of", "array-like-index"), undefined).kind, "rejected");
  for (const mechanism of ["union", "untyped-dynamic-iteration"]) {
    assert.equal(select(source("for-await-of", mechanism), array).kind, "rejected");
  }
});
