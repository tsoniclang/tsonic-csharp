import assert from "node:assert/strict";
import test from "node:test";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import {
  csharpAbsenceTargetType,
  csharpNullableReferenceTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  getCsharpNullableElementTargetType,
  isCsharpNullableReferenceTargetType,
  targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

const parameter = Object.freeze({ kind: "type-parameter", identity: "native:Result:T", name: "T" });
const nativeAnnotation = csharpNullableReferenceTargetType(parameter);

test("an unconstrained native T? field remains a nonnullable physical value-type field after substitution", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const selected = substituteTargetTypeParameters(nativeAnnotation, new Map([[parameter.identity, integer]]));
  assert.equal(targetTypeRefEquals(selected, integer), true, "native annotated T? does not manufacture Nullable<int>");
  assert.equal(getCsharpNullableElementTargetType(selected) === undefined, true, "the actual field has no absence payload");
  const policy = createNativeConversionHost();
  assert.equal(selectCsharpConversion(policy, csharpAbsenceTargetType(), selected, "implicit").kind, "rejected",
    "a logical optional Source field cannot authorize an absent write to the nonnullable native field");
});

test("an unconstrained native T? field retains its nullable reference annotation for a reference argument", () => {
  const text = csharpStringTargetType();
  const selected = substituteTargetTypeParameters(nativeAnnotation, new Map([[parameter.identity, text]]));
  assert.equal(isCsharpNullableReferenceTargetType(selected), true, "the actual reference field may hold native absence");
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected), text), true,
    "the exact native reference payload is retained");
});

for (const keyword of ["struct", "unmanaged"]) {
  test(`native annotated T? substitution preserves a ${keyword}-constrained generic field as its actual value type`, () => {
    const argument = Object.freeze({
      kind: "type-parameter", identity: `native:Caller:${keyword}:U`, name: "U",
      csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword }] },
    });
    const selected = substituteTargetTypeParameters(nativeAnnotation, new Map([[parameter.identity, argument]]));
    assert.equal(targetTypeRefEquals(selected, argument), true, "substitution preserves the original constrained binder");
    assert.equal(isCsharpNullableReferenceTargetType(selected), false,
      "emitting U? under a value constraint would incorrectly change the actual native field to Nullable<U>");
  });
}

test("native reference annotation and genuine Source optional storage remain distinct during generic substitution", () => {
  const argument = Object.freeze({ kind: "type-parameter", identity: "native:Caller:U", name: "U" });
  const selected = substituteTargetTypeParameters(nativeAnnotation, new Map([[parameter.identity, argument]]));
  assert.equal(isCsharpNullableReferenceTargetType(selected), true, "an unconstrained native binder retains only its annotation");
  assert.equal(getCsharpNullableElementTargetType(selected).identity === argument.identity, true,
    "the selected field retains the exact generic binder, not an optional-storage projection");
  const integer = csharpSourcePrimitiveTargetType("int32");
  const sourceOptional = substituteTargetTypeParameters(csharpNullableTargetType(parameter), new Map([[parameter.identity, integer]]));
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(sourceOptional), integer), true,
    "genuine Source optional<T> still owns a real Nullable<int> carrier after the same application");
});
