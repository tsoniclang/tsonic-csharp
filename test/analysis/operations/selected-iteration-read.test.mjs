import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpIteration } from "../../../dist/analysis/operations/iteration/selection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

const integer = csharpSourcePrimitiveTargetType("int32");
const array = { kind: "array", element: integer };
// The Host iteration selection (facts.selections.iteration) of a for-of over an array; C# reads the represented
// iterable carrier it is given and never asks for another value representation.
const statement = {};
const iteration = { statement, protocol: "array", iterable: { kind: "array", readonly: false, element: { kind: "primitive", primitive: "int32" } },
  element: { kind: "primitive", primitive: "int32" } };
const policy = {
  ast: { is: { IsForOfStatement: node => node === statement }, as: { AsForInOrOfStatement: () => ({ AwaitModifier: undefined }) } },
  facts: { selections: { iteration: node => node === statement ? iteration : undefined } },
  types: {
    value: () => assert.fail("an early logical descriptor cannot replace the selected read"),
    storage: () => assert.fail("an early logical descriptor cannot replace the selected read"),
  },
};

test("iteration consumes the exact finalized read carrier rather than reopening its logical union", () => {
  const selected = selectCsharpIteration(policy, statement, {}, array);
  assert.equal(selected.kind === "resolved", true);
  assert.equal(selected.iterableType === array && selected.elementType === integer, true,
    "the existing read and element identities are retained");
});

test("missing selected iteration reads refuse without retrying the raw occurrence", () => {
  const selected = selectCsharpIteration(policy, statement, {}, undefined);
  assert.equal(selected.kind, "rejected");
  assert.equal(selected.reason, "The checked iterable expression does not have a closed C# target representation.");
});

test("a selected noniterable carrier cannot be replaced by an alternative raw array", () => {
  const selected = selectCsharpIteration(policy, statement, {}, integer);
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

