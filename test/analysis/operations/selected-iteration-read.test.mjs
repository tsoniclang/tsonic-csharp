import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpIteration } from "../../../dist/analysis/operations/iteration/selection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

const integer = csharpSourcePrimitiveTargetType("int32");
const array = { kind: "array", element: integer };
const iteration = { iterationKind: "for-of", mechanism: { kind: "array-like-index" } };
const policy = {
  semantics: () => ({ operations: { iteration: () => iteration } }),
  types: { resolveNode: () => assert.fail("an early logical descriptor cannot replace the selected read") },
};

test("iteration consumes the exact finalized read carrier rather than reopening its logical union", () => {
  const selected = selectCsharpIteration(policy, {}, {}, {}, array);
  assert.equal(selected.kind === "resolved", true);
  assert.equal(selected.iterableType === array && selected.elementType === integer, true,
    "the existing read and element identities are retained");
});

test("missing selected iteration reads refuse without retrying the raw occurrence", () => {
  const selected = selectCsharpIteration(policy, {}, {}, {}, undefined);
  assert.equal(selected.kind, "rejected");
  assert.equal(selected.reason, "The checked iterable expression does not have a closed C# target representation.");
});

test("a selected noniterable carrier cannot be replaced by an alternative raw array", () => {
  const selected = selectCsharpIteration(policy, {}, {}, {}, integer);
  assert.equal(selected.kind, "rejected");
  assert.equal(selected.reason, "The selected C# iterable representation does not prove an enumerable target element.");
});

for (const surface of ["native", "js"]) {
  test(`${surface} guarded collection iteration retains its actual selected array read`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function first(values: number | readonly number[]): number {
        if (typeof values === "number") return values;
        for (const value of values) return value;
        return 0;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.artifacts.size > 0, true, "the actual guarded program reaches emission");
  });
}

