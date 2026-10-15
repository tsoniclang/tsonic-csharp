import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpProgramErrorCarrier, selectCsharpThrownOperandCarrier } from "../../../dist/policy/conversions/program-error.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpRuntimeUnionTargetType,
  csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpTargetNamedType,
  csharpTsValueTargetType } from "../../../dist/target-model/types/index.js";

const native = csharpExceptionTargetType();
const source = csharpRuntimeErrorTargetType();
const derived = csharpTargetNamedType("Project.Failure", undefined, { kind: "named", name: "Failure" });
const unrelated = csharpTargetNamedType("Project.Value", undefined, { kind: "named", name: "Value" });
const host = {
  projectTypes: { directSupertypes: carrier => carrier === derived ? [source] : [] },
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};

test("native error alternatives share one exact reference projection without boxing", () => {
  for (const arms of [[source, native], [native, source], [derived, native], [native, derived, source]]) {
    const carrier = csharpRuntimeUnionTargetType(arms);
    assert.deepEqual(selectCsharpProgramErrorCarrier(host, carrier), native);
    const conversion = selectCsharpConversion(host, carrier, native, "implicit");
    assert.equal(conversion.kind, "runtime-union-reference");
    assert.deepEqual(conversion.arms, arms);
    assert.deepEqual(conversion.target, native);
  }
  for (const carrier of [native, source, derived, csharpNullableTargetType(native)]) {
    assert.equal(selectCsharpProgramErrorCarrier(host, carrier), carrier);
  }
});

test("throw selection rejects absence, non-errors and value-type admission", () => {
  const value = csharpTargetNamedType("Project.Record", undefined, { kind: "named", name: "Record" }, { valueType: true });
  for (const carrier of [undefined, unrelated, csharpSourcePrimitiveTargetType("uint64"),
    csharpRuntimeUnionTargetType([source, unrelated]),
    csharpRuntimeUnionTargetType([source, value]), csharpRuntimeUnionTargetType([source, csharpNullableTargetType(native)])]) {
    assert.equal(selectCsharpProgramErrorCarrier(host, carrier), undefined);
  }
});

test("throw selection requires the native hierarchy instead of a same-spelled source name", () => {
  const local = csharpTargetNamedType("Project.Error", undefined, { kind: "named", name: "Error" });
  const cyclic = { ...host, projectTypes: { directSupertypes: carrier => carrier === local ? [unrelated] : [local] } };
  assert.equal(selectCsharpProgramErrorCarrier(cyclic, local), undefined);
  assert.equal(selectCsharpProgramErrorCarrier(cyclic, csharpRuntimeUnionTargetType([native, local])), undefined);
});

test("a checked closed-value cast is not native throwable evidence", () => {
  const closed = csharpTsValueTargetType();
  const selected = { ...host, objectShapes: { resolveTarget: () => undefined } };
  const conversion = selectCsharpConversion(selected, closed, native, "implicit");
  assert.equal(conversion.kind, "js-value-cast");
  assert.equal(selectCsharpProgramErrorCarrier(selected, closed), undefined);
  assert.deepEqual(selectCsharpThrownOperandCarrier(selected, closed), closed);
});
