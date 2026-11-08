import assert from "node:assert/strict";
import test from "node:test";
import { csharpSelectedCallResultType } from "../../../dist/target-model/types/member-facts.js";
import { csharpSourcePrimitiveTargetType, csharpTargetNamedType, csharpVoidTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const owner = csharpTargetNamedType("native:Owner", [], { kind: "named", name: "Owner" }, {
  allowsRefLikeTypeArguments: [],
});
const byteArray = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("uint8") });

test("selected native call completion preserves constructor and method physical ABI", () => {
  const constructor = { kind: "constructor", declaringType: owner, returnType: csharpVoidTargetType() };
  assert.equal(csharpSelectedCallResultType(constructor, false) === owner, true,
    "construction produces its real native declaring type, not its declared void completion");
  for (const kind of ["method", "operator"]) {
    assert.equal(csharpSelectedCallResultType({ kind, returnType: byteArray }, false) === byteArray, true,
      "the original native array ABI is not replaced by a logical Source array");
  }
});

test("discarding a selected native result uses void only after exact completion metadata exists", () => {
  for (const member of [{ kind: "constructor", declaringType: owner }, { kind: "method", returnType: byteArray }]) {
    assert.equal(targetTypeRefEquals(csharpSelectedCallResultType(member, true), csharpVoidTargetType()), true,
      "a real discarded completion is native void");
  }
  for (const member of [{ kind: "constructor" }, { kind: "method" }, { kind: "property", returnType: byteArray }]) {
    for (const discard of [false, true]) {
      assert.equal(csharpSelectedCallResultType(member, discard) === undefined, true,
        "discarding cannot hide a missing or noninvocable physical ABI");
    }
  }
});
