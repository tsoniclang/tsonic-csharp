import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpArrayBindingProjectionTarget,
  csharpJsArrayTargetType,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  reconcileCsharpSelectedTargetType,
  resolveCsharpArrayBindingCarrier,
} from "../dist/policy/types/index.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const string = csharpStringTargetType();

test("array binding policy preserves raw and JS array rest carriers", () => {
  const rawArray = { kind: "array", element: int32 };
  const raw = resolveCsharpArrayBindingCarrier(rawArray);
  assert.deepEqual(raw, {
    kind: "array",
    carrier: rawArray,
    element: int32,
    lengthMember: "Length",
    restSlice: "runtime-array-helper",
    restCarrier: rawArray,
  });
  assert.deepEqual(csharpArrayBindingProjectionTarget(raw, 0, false), int32);
  assert.deepEqual(csharpArrayBindingProjectionTarget(raw, 1, true), rawArray);

  const jsArray = csharpJsArrayTargetType(string);
  const js = resolveCsharpArrayBindingCarrier(jsArray);
  assert.deepEqual(js, {
    kind: "array",
    carrier: jsArray,
    element: string,
    lengthMember: "length",
    restSlice: "instance-slice",
    restCarrier: jsArray,
  });
});

test("array binding policy projects fixed tuple rest as an exact tuple slice", () => {
  const tuple = {
    kind: "tuple",
    elements: [string, int32, int32],
  };
  const carrier = resolveCsharpArrayBindingCarrier(tuple);
  assert.deepEqual(csharpArrayBindingProjectionTarget(carrier, 1, false), int32);
  assert.deepEqual(csharpArrayBindingProjectionTarget(carrier, 1, true), {
    kind: "tuple",
    elements: [int32, int32],
  });
  assert.equal(csharpArrayBindingProjectionTarget(carrier, 4, false), undefined);
});

test("array binding policy states the concrete rest carrier for read-only lists", () => {
  const readOnly = csharpReadOnlyListTargetType(int32);
  const carrier = resolveCsharpArrayBindingCarrier(readOnly);
  assert.equal(carrier?.kind, "array");
  assert.equal(carrier?.lengthMember, "Count");
  assert.equal(carrier?.restSlice, "js-array-helper");
  assert.deepEqual(
    csharpArrayBindingProjectionTarget(carrier, 2, true),
    carrier?.restCarrier,
  );
  assert.equal(carrier?.restCarrier.kind, "target-named");
  assert.equal(carrier?.restCarrier.id, "System.Collections.Generic.List`1");
});

test("selected type reconciliation preserves closed authored aliases only for the same source declaration", () => {
  const authored = {
    kind: "target-named",
    id: "Example.Box`1",
    typeArguments: [int32],
  };
  const erased = {
    kind: "target-named",
    id: "Example.Box`1",
    typeArguments: [csharpSourcePrimitiveTargetType("float64")],
  };
  const open = {
    kind: "target-named",
    id: "Example.Box`1",
    typeArguments: [{ kind: "type-parameter", name: "T" }],
  };

  assert.strictEqual(
    reconcileCsharpSelectedTargetType(authored, erased, "same-declaration"),
    authored,
  );
  assert.strictEqual(
    reconcileCsharpSelectedTargetType(open, erased, "same-declaration"),
    erased,
  );
  assert.strictEqual(
    reconcileCsharpSelectedTargetType(authored, erased, "unrelated"),
    erased,
  );
});
