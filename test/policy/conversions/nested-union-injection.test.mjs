import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { promiseConstructorMember } from "../../../dist/policy/operations/source-profiles/promise-source-profile.js";
import { csharpDelegateTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTaskTargetType, getCsharpDelegateSignature,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const policy = { projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
const scalar = csharpSourcePrimitiveTargetType("float64");
const parameter = Object.freeze({ kind: "type-parameter", identity: "checked:Value", name: "Value" });

test("a native scalar enters its unique complete nested union arm without changing the payload", () => {
  const inner = csharpRuntimeUnionTargetType([scalar, parameter]);
  const target = csharpRuntimeUnionTargetType([inner, csharpTaskTargetType(inner)]);
  const selected = selectCsharpConversion(policy, scalar, target, "implicit");
  assert.equal(selected.kind === "implicit" && selected.proof === "runtime-union-arm", true,
    "the existing union-construction selection owns the outer native arm");
  assert.equal(selected.armIndex === 0 && targetTypeRefEquals(selected.armType, inner), true,
    "the exact intermediate native carrier is retained");
  const nested = selected.sourceToArm;
  assert.equal(nested.kind === "implicit" && nested.proof === "runtime-union-arm" && nested.armIndex === 0, true,
    "the same selection reaches the unique scalar arm");
  assert.equal(targetTypeRefEquals(nested.armType, scalar) && nested.sourceToArm.kind === "identity", true,
    "the payload is not boxed, rounded or cast");
  assert.equal(admitCsharpConversionSelection(policy, scalar, target, selected).kind, "implicit",
    "the complete recursive evidence is admitted before the seal");
  const invalid = { ...selected, armType: scalar };
  assert.equal(admitCsharpConversionSelection(policy, scalar, target, invalid).kind, "rejected",
    "a forged intermediate carrier is still rejected by admission");
});

test("the real completion delegate can accept a scalar through its nested value union", () => {
  const result = csharpRuntimeUnionTargetType([scalar, parameter]);
  const constructor = promiseConstructorMember(csharpTaskTargetType(result));
  const executor = getCsharpDelegateSignature(constructor.parameters[0].type);
  const resolve = executor.parameters[0];
  const target = csharpDelegateTargetType("System.Action", [scalar]);
  const selected = selectCsharpConversion(policy, resolve, target, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "adaptation", true,
    "the existing native callable adapter performs the required parameter adaptation");
  assert.equal(selected.parameterConversions.length, 1, "the actual incoming value is converted once");
  assert.equal(selected.parameterConversions[0].kind === "implicit" &&
    selected.parameterConversions[0].sourceToArm?.proof === "runtime-union-arm", true,
  "the real TaskResolve value channel retains its nested native union path");
  assert.equal(admitCsharpConversionSelection(policy, resolve, target, selected).kind, "delegate-adapter",
    "the selected real delegate conversion is admitted without a Promise-specific fallback");
});

test("multiple exact nested native union paths are refused instead of choosing one by order", () => {
  const target = csharpRuntimeUnionTargetType([
    csharpRuntimeUnionTargetType([scalar, csharpStringTargetType()]),
    csharpRuntimeUnionTargetType([scalar, csharpSourcePrimitiveTargetType("bool")]),
  ]);
  const selected = selectCsharpConversion(policy, scalar, target, "implicit");
  assert.equal(selected.kind, "rejected", "two native paths require a source decision, not arbitrary injection");
  assert.equal(selected.reason, "C# runtime-union conversion matched more than one structurally identical union arm.",
    "the established ambiguity diagnostic is preserved");
});
