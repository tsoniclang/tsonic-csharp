import assert from "node:assert/strict";
import test from "node:test";
import { csharpReadonlyFieldPreservesStorage } from "../../../dist/policy/ownership/class-properties.js";
import { isCsharpDelegateTargetRef, isTypeParameterTargetRef } from "../../../dist/policy/ownership/type-categories.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableValueTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const widget = csharpTargetNamedType("Acme.Widget", [], undefined, { allowsRefLikeTypeArguments: [] });
const point = csharpTargetNamedType("Acme.Point", [], undefined, { allowsRefLikeTypeArguments: [], valueType: true });
const parameter = Object.freeze({ kind: "type-parameter", identity: "owner:Box:T", name: "T" });

test("a readonly C# field preserves the stored value only when reads never copy a mutable struct", () => {
  assert.equal(csharpReadonlyFieldPreservesStorage(int32), true, "scalar primitives are immutable values");
  assert.equal(csharpReadonlyFieldPreservesStorage(widget), true, "a reference field shares its object");
  assert.equal(csharpReadonlyFieldPreservesStorage(point), false, "a readonly struct field reads a defensive copy");
  assert.equal(csharpReadonlyFieldPreservesStorage(csharpNullableValueTargetType(point)), false,
    "a nullable struct is judged by its element");
  assert.equal(csharpReadonlyFieldPreservesStorage(csharpNullableValueTargetType(int32)), true);
  assert.equal(csharpReadonlyFieldPreservesStorage(parameter), false, "an unconstrained type parameter may be a struct");
});

test("ownership categories recognize type parameters and native delegates by their exact carrier", () => {
  assert.equal(isTypeParameterTargetRef(parameter), true);
  assert.equal(isTypeParameterTargetRef(widget), false);
  assert.equal(isTypeParameterTargetRef(undefined), false);
  assert.equal(isCsharpDelegateTargetRef(csharpDelegateTargetType("System.Func", [int32], int32)), true);
  assert.equal(isCsharpDelegateTargetRef(csharpDelegateTargetType("System.Action", [])), true);
  assert.equal(isCsharpDelegateTargetRef(widget), false);
  assert.equal(isCsharpDelegateTargetRef(undefined), false);
});
