import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCommonReadOnlySequenceTarget } from "../../../dist/policy/conversions/selection/common-target.js";
import { selectCsharpNullishSequenceTarget } from "../../../dist/policy/types/collections/common-carrier.js";
import { csharpJsArrayTargetType, csharpReadOnlyListTargetType, csharpSourcePrimitiveTargetType,
  csharpNullableTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";

const input = {
  projectTypes: { directSupertypes: () => [], typeFromTarget: () => undefined },
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};

test("common native read-only selection borrows exact arrays without changing their elements", () => {
  for (const element of [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64"),
    csharpSourcePrimitiveTargetType("uint64")]) {
    const authored = csharpJsArrayTargetType(element);
    const native = { kind: "array", element };
    const target = csharpReadOnlyListTargetType(element);
    assert.deepEqual(selectCsharpCommonReadOnlySequenceTarget(input, [authored, native]), target);
    assert.deepEqual(selectCsharpCommonReadOnlySequenceTarget(input, [native, authored]), target);
    assert.deepEqual(selectCsharpCommonReadOnlySequenceTarget(input, [authored, authored]), authored);
    assert.deepEqual(selectCsharpCommonReadOnlySequenceTarget(input, [native, native]), native);
    assert.deepEqual(selectCsharpNullishSequenceTarget(input, csharpNullableTargetType(authored), native), target);
    assert.deepEqual(selectCsharpNullishSequenceTarget(input, csharpNullableTargetType(authored),
      csharpNullableTargetType(native)), csharpNullableTargetType(target));
  }
});

test("common borrowed selection rejects unrelated identities, widths and mutable element covariance", () => {
  const signed = csharpSourcePrimitiveTargetType("int64");
  const authored = csharpJsArrayTargetType(signed);
  for (const alternative of [
    { kind: "array", element: csharpSourcePrimitiveTargetType("uint64") },
    { kind: "array", element: csharpSourcePrimitiveTargetType("float64") },
    { kind: "target-named", id: "unrelated.Sequence", typeArguments: [signed] },
    { kind: "target-named", id: "unrelated.Sequence", typeArguments: [signed],
      csharpReadOnlyIndexableElementType: signed },
    { kind: "opaque", id: "unknown" },
  ]) assert.equal(selectCsharpCommonReadOnlySequenceTarget(input, [authored, alternative]), undefined);
  assert.equal(selectCsharpCommonReadOnlySequenceTarget(input, []), undefined);
});
