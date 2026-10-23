import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCsharpSelectedTargetType, retainCsharpBroadValueCarrier } from "../../../dist/policy/types/resolution/selected-type-evidence.js";
import { csharpBigIntegerTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

test("checked bigint selection does not replace an authored native integer carrier", () => {
  for (const name of ["int64", "uint64", "int128", "uint128", "native-int", "native-uint"]) {
    const authored = csharpSourcePrimitiveTargetType(name);
    assert.equal(reconcileCsharpSelectedTargetType(authored, csharpBigIntegerTargetType(), "unrelated", false), authored,
      "the native declaration owns its representation even when checker bigint literal evidence has another identity");
  }
});

test("native integer retention does not erase a different noninteger selected type", () => {
  const authored = csharpSourcePrimitiveTargetType("int64");
  for (const selected of [csharpStringTargetType(), csharpSourcePrimitiveTargetType("bool"),
    csharpSourcePrimitiveTargetType("float64")]) {
    assert.equal(reconcileCsharpSelectedTargetType(authored, selected, "unrelated", false), selected);
  }
});

test("a checked source object refinement is not an explicit native Object ABI projection", () => {
  const broad = csharpTsValueTargetType();
  const nativeObject = csharpObjectTargetType();
  assert.equal(retainCsharpBroadValueCarrier(broad, nativeObject, true) === broad, true,
    "the checked source-only broad object fact preserves its actual closed broad storage");
  assert.equal(reconcileCsharpSelectedTargetType(broad, nativeObject, "unrelated", true) === broad, true,
    "source reconciliation consumes the same checked fact");
  assert.equal(retainCsharpBroadValueCarrier(broad, nativeObject, false) === undefined, true,
    "physical Object equality alone grants no broad-value retention");
  assert.equal(reconcileCsharpSelectedTargetType(broad, nativeObject, "unrelated", false) === nativeObject, true,
    "an actual native Object projection retains its native ABI");
  for (const valueType of [false, true]) {
    const payload = csharpTargetNamedType(`Example.Payload${valueType ? "Struct" : "Class"}`, undefined,
      { kind: "named", name: valueType ? "PayloadStruct" : "PayloadClass" },
      { allowsRefLikeTypeArguments: [], valueType });
    for (const checkedSourceObject of [false, true]) {
      assert.equal(retainCsharpBroadValueCarrier(broad, payload, checkedSourceObject) === undefined, true,
        "an exact native payload is not a broad object representation");
      assert.equal(reconcileCsharpSelectedTargetType(broad, payload, "unrelated", checkedSourceObject) === payload, true,
        "native class and struct payload projections remain exact");
    }
  }
});
