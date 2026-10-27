import assert from "node:assert/strict";
import test from "node:test";
import { csharpCallableParameterConversionRequests, selectCsharpCallableParameterAdapters } from "../../../dist/policy/conversions/callable-parameters.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

test("optional rest elements retain native absence when their source already carries it", () => {
  const wide = Object.freeze({ kind: "source-primitive", name: "int64" });
  const optional = csharpNullableTargetType(wide);
  const source = [{ name: "values", type: { kind: "array", element: optional }, passingMode: "by-value", paramsArray: true }];
  const target = [{ name: "value", type: optional, passingMode: "by-value", optional: true }];
  const requests = csharpCallableParameterConversionRequests(source, target);
  assert.equal(requests.some(request => request.source === optional && request.target === optional), true,
    "existing native absence is a real source value, not an unconditional unwrap");
  const selected = selectCsharpCallableParameterAdapters(source, target,
    [{ source: optional, target: optional, conversion: { kind: "identity" } }]);
  assert.equal(selected?.length, 1, "the original scalar body receives one native element");
  const entry = selected[0];
  assert.equal(entry.kind === "rest-element" && entry.parameterIndex === 0 && entry.offset === 0 && entry.optional, true,
    "element position and source omission remain explicit");
  assert.equal(entry.adapter.source === optional && entry.adapter.target === optional && entry.adapter.conversion.kind === "identity", true,
    "absence survives without boxing, conversion or a second optional state");
});
