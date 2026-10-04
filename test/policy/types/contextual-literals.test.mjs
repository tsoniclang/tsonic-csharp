import assert from "node:assert/strict";
import test from "node:test";
import { resolveCsharpContextualLiteralCarrier } from "../../../dist/policy/types/resolution/contextual-literals.js";
import { csharpJsArrayTargetType } from "../../../dist/policy/types/resolution/surface-types.js";
import { csharpReadOnlyListTargetType } from "../../../dist/target-model/types/collections.js";

const empty = {};
const nonempty = {};
const host = {
  ast: {
    is: {
      IsArrayLiteralExpression: node => node === empty || node === nonempty,
      IsObjectLiteralExpression: () => false,
    },
    elements: node => node === empty ? [] : [{}],
  },
};

test("empty literals select the exact sibling collection carrier without changing native elements", () => {
  for (const element of [{ kind: "source-primitive", name: "string" }, { kind: "source-primitive", name: "uint64" }]) {
    for (const carrier of [{ kind: "array", element }, csharpJsArrayTargetType(element), csharpReadOnlyListTargetType(element)]) {
      assert.equal(resolveCsharpContextualLiteralCarrier(host, empty, carrier) === carrier, true);
      assert.equal(resolveCsharpContextualLiteralCarrier(host, nonempty, carrier) === undefined, true);
    }
  }
});

test("empty literal context cannot invent a scalar, nonempty tuple or missing carrier", () => {
  const element = { kind: "source-primitive", name: "uint64" };
  for (const carrier of [undefined, element, { kind: "tuple", elements: [element] }]) {
    assert.equal(resolveCsharpContextualLiteralCarrier(host, empty, carrier) === undefined, true);
  }
  const tuple = { kind: "tuple", elements: [] };
  assert.equal(resolveCsharpContextualLiteralCarrier(host, empty, tuple) === tuple, true);
});
