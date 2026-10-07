import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCsharpSelectedTargetType } from "../../../dist/policy/types/resolution/selected-type-evidence.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/scalar-types.js";

test("checked bigint selection does not replace an authored native integer carrier", () => {
  for (const name of ["int64", "uint64", "int128", "uint128", "native-int", "native-uint"]) {
    const authored = csharpSourcePrimitiveTargetType(name);
    assert.equal(reconcileCsharpSelectedTargetType(authored, csharpBigIntegerTargetType(), "unrelated"), authored,
      "the native declaration owns its representation even when checker bigint literal evidence has another identity");
  }
});

test("native integer retention does not erase a different noninteger selected type", () => {
  const authored = csharpSourcePrimitiveTargetType("int64");
  for (const selected of [csharpStringTargetType(), csharpSourcePrimitiveTargetType("bool"),
    csharpSourcePrimitiveTargetType("float64")]) {
    assert.equal(reconcileCsharpSelectedTargetType(authored, selected, "unrelated"), selected);
  }
});
