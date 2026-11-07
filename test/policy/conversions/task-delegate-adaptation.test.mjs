import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpDelegateContractRecord } from "../../helpers/planning-records.mjs";

const integer = csharpSourcePrimitiveTargetType("int64");
const floating = csharpSourcePrimitiveTargetType("float64");
const text = csharpSourcePrimitiveTargetType("string");
const policy = { projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
const source = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(integer));
const target = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(floating));

test("Task payload widening belongs only to a closed delegate return adapter", () => {
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "adaptation", true);
  assert.equal(selected.returnConversion.kind, "task-return");
  assert.equal(targetTypeRefEquals(selected.returnConversion.sourceResult, integer), true);
  assert.equal(targetTypeRefEquals(selected.returnConversion.targetResult, floating), true);
  assert.equal(selected.returnConversion.conversion.kind === "implicit" &&
    selected.returnConversion.conversion.proof === "numeric", true);
  assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true);
  assert.equal(selectCsharpConversion(policy, source.csharpDelegateSignature.returnType,
    target.csharpDelegateSignature.returnType, "implicit").kind, "rejected",
  "ordinary Task<long> storage cannot acquire a global Task<double> conversion");
  assert.equal(selectCsharpConversion(policy, source, source, "implicit").kind, "identity");
  assert.equal(selectCsharpConversion(policy, target, source, "implicit").kind, "rejected",
    "an implicit async result cannot narrow double to long");
});

test("Task result adapters keep the existing payload, arity, byref and rest guards", () => {
  for (const [label, changedSource, changedTarget] of [
    ["incompatible payload", source, csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(text))],
    ["non-Task destination", source, csharpDelegateTargetType("System.Func", [], floating)],
    ["non-Task producer", csharpDelegateTargetType("System.Func", [], integer), target],
    ["missing source argument", csharpDelegateTargetType("System.Func", [integer], source.csharpDelegateSignature.returnType), target],
    ["void Task producer", csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(csharpVoidTargetType())), target],
  ]) assert.equal(selectCsharpConversion(policy, changedSource, changedTarget, "implicit").kind,
    "rejected", label);
  for (const mode of ["byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]) {
    const from = csharpDelegateTargetType("System.Func", [integer], source.csharpDelegateSignature.returnType);
    const to = csharpDelegateTargetType("System.Func", [integer], target.csharpDelegateSignature.returnType);
    const changed = carrier => ({ ...carrier, csharpDelegateSignature: {
      ...carrier.csharpDelegateSignature, parameterPassingModes: [mode],
    } });
    assert.equal(selectCsharpConversion(policy, changed(from), changed(to), "implicit").kind, "rejected",
      mode + " cannot be wrapped by a Task adapter");
  }
  for (const [label, signature] of [
    ["return byref", { ...source.csharpDelegateSignature, returnPassing: "byref-readonly" }],
    ["params mismatch", { ...source.csharpDelegateSignature, restParameterIndex: 0 }],
  ]) assert.equal(selectCsharpConversion(policy, { ...source, csharpDelegateSignature: signature },
    target, "implicit").kind, "rejected", label);
});

test("independent admission rejects foreign, explicit, missing and cyclic Task payload plans", () => {
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.returnConversion.kind === "task-return", true);
  for (const [label, change] of [
    ["foreign source payload", { sourceResult: text }],
    ["foreign target payload", { targetResult: integer }],
    ["missing source payload", { sourceResult: undefined }],
    ["missing target payload", { targetResult: undefined }],
    ["missing payload conversion", { conversion: undefined }],
    ["explicit conversion", { conversion: { kind: "cast", proof: "numeric" } }],
    ["rejected payload", { conversion: { kind: "rejected", reason: "not admitted" } }],
  ]) {
    const forged = { ...selected, returnConversion: { ...selected.returnConversion, ...change } };
    assert.equal(admitCsharpConversionSelection(policy, source, target, forged).kind, "rejected", label);
  }
  assert.equal(admitCsharpConversionSelection(policy, source, target,
    { ...selected, strategy: "native-binding" }).kind, "rejected", "a Task map is not CLR native binding");
  const cyclic = { ...selected, returnConversion: { ...selected.returnConversion } };
  cyclic.returnConversion.conversion = cyclic;
  assert.equal(admitCsharpConversionSelection(policy, source, target, cyclic).kind, "rejected",
    "the selected conversion tree must stay finite");
});

test("a Task payload delegate keeps its independently admitted child emission contract", () => {
  const sourcePayload = csharpDelegateTargetType("System.Func", [], integer);
  const targetPayload = csharpDelegateTargetType("System.Func", [], floating);
  const from = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(sourcePayload));
  const to = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(targetPayload));
  const selected = selectCsharpConversion(policy, from, to, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.returnConversion.kind === "task-return" &&
    selected.returnConversion.conversion.kind === "delegate-adapter", true);
  assert.equal(admitCsharpConversionSelection(policy, from, to, selected) === selected, true);
  const contracts = csharpDelegateContractRecord([[from, to, selected]]);
  assert.equal(contracts.get(from, to) !== undefined && contracts.get(sourcePayload, targetPayload) !== undefined, true,
    "return-child traversal must publish the exact nested native delegate contract");
});
