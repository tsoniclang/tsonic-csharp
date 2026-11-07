import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpTargetTypeRenderingRejection } from "../../../dist/policy/types/model/renderability.js";

const roles = ["csharpArrayLiteralElementType", "csharpArrayLikeElementType", "csharpEnumerableElementType",
  "csharpReadOnlyIndexableElementType", "csharpDenseMutableElementType", "csharpImplicitArrayInputElementType"];

test("JSArray rendering rejects role metadata that disagrees with its physical generic element", () => {
  const element = csharpSourcePrimitiveTargetType("int32");
  const array = csharpJsArrayTargetType(element);
  assert.equal(csharpTargetTypeRenderingRejection(array) === undefined, true, "the actual factory publishes one exact element");
  for (const role of roles) {
    for (const different of [csharpSourcePrimitiveTargetType("uint32"), { kind: "array", element }]) {
      const malformed = { ...array, [role]: different };
      assert.equal(targetTypeRefKey(malformed) === targetTypeRefKey(array), true,
        "role consistency belongs at rendering admission, never in Native type identity");
      assert.throws(() => csharpTargetTypeRenderingRejection(malformed),
        /JSArray metadata roles must match its physical generic element/u, role);
    }
  }
  for (const width of ["int32", "int64", "float64", "uint64"]) {
    assert.equal(csharpTargetTypeRenderingRejection(csharpJsArrayTargetType(csharpSourcePrimitiveTargetType(width))) === undefined,
      true, "the invariant retains exact native widths without choosing another carrier");
  }
  assert.equal(csharpTargetTypeRenderingRejection({ ...array, id: "Project.OtherArray" }) === undefined, true,
    "a different declared Native ABI is not identified by its shape or spelling");
});
