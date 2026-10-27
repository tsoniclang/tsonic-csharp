import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceParameterVector } from "../../../dist/policy/types/callables/parameter-vector.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const wide = Object.freeze({ kind: "source-primitive", name: "int64" });
const text = Object.freeze({ kind: "source-primitive", name: "string" });
const tuple = Object.freeze({ kind: "tuple", elements: Object.freeze([integer, wide, text]) });
const parameter = Object.freeze({ name: "values", type: tuple, passingMode: "by-value", paramsArray: true });

test("source tuple-rest projection uses one ordered exact native slot vector", () => {
  const selected = selectCsharpSourceParameterVector(parameter,
    [{ elementKind: "required" }, { elementKind: "required" }, { elementKind: "optional" }]);
  assert.equal(selected?.length, 3, "all finite source tuple positions become actual native arguments");
  assert.equal(selected[0].type === integer && selected[1].type === wide && selected[2].type === text, true,
    "the original exact native field carriers and order survive projection");
  assert.equal(selected.every(slot => slot.passingMode === "by-value" && slot.paramsArray !== true), true,
    "a finite rest tuple is not a native params ValueTuple");
  assert.deepEqual(selected.map(slot => slot.optional === true), [false, false, true], "checked omission belongs to its expanded slot");
  assert.equal(Object.isFrozen(selected) && selected.every(Object.isFrozen), true, "the vector is immutable");
});

test("ordinary tuple and array parameters retain their single native input", () => {
  const ordinary = Object.freeze({ ...parameter, paramsArray: false });
  assert.equal(selectCsharpSourceParameterVector(ordinary, undefined)[0] === ordinary, true,
    "a tuple value is not a source rest-argument list");
  const array = Object.freeze({ ...parameter, type: Object.freeze({ kind: "array", element: wide }) });
  assert.equal(selectCsharpSourceParameterVector(array, undefined)[0] === array, true,
    "an open-ended array rest remains one native array input");
  assert.equal(selectCsharpSourceParameterVector(parameter, undefined), undefined, "missing checked slot metadata is not guessed");
  assert.equal(selectCsharpSourceParameterVector(parameter, [{ elementKind: "required" }]), undefined,
    "checked and physical tuple widths must correspond exactly");
});
