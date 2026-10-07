import assert from "node:assert/strict";
import test from "node:test";
import { csharpMethodValueType, csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { reconcileInferredReturnTargetContract } from "../../../dist/analysis/declarations/analyze.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/selection/core.js";

const owner = { kind: "target-named", id: "tsonic.shape:environment", csharpRender: { kind: "named", name: "Environment" } };
const protocol = { kind: "target-named", id: "tsonic.shape:protocol", csharpRender: { kind: "named", name: "Protocol" } };
const parameter = { kind: "type-parameter", name: "Value", identity: "original-source-binder" };
const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
const method = csharpMethodValueType(owner, "identity", "source.identity", signature, [parameter.identity]);
const inferred = csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, [parameter.identity]);
const policy = { projectTypes: { directSupertypes() { return []; } }, providers: { findTargetBindingByTargetId() {} }, target: {} };

test("inferred generic callable coverage selects the original method and native environment", () => {
  assert.equal(csharpMethodValueCoversContract(method, inferred), true, "exact quantified baseline is covered");
  const selected = reconcileInferredReturnTargetContract(policy, inferred, [method], false);
  assert.equal(selected.kind === "resolved" && selected.type === method, true, "the original carrier is retained by identity");
  assert.equal(getCsharpMethodValue(selected.type).owner === owner, true, "the captured environment is not replaced");
  assert.equal(getCsharpMethodValue(selected.type).contract === signature, true, "the original signature is retained");
});

test("inferred callable coverage rejects changed binders, quantified arity and native carriers", () => {
  const otherParameter = { ...parameter, identity: "unrelated-source-binder" };
  const number = { kind: "source-primitive", name: "float64" };
  const changedContracts = [
    csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, [parameter.identity, "unused"]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [otherParameter], otherParameter), [otherParameter.identity]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [parameter], number), [parameter.identity]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [number], parameter), [parameter.identity]),
  ];
  for (const changed of changedContracts) {
    assert.equal(changed !== undefined, true, "the negative control itself has a valid contract");
    assert.equal(csharpMethodValueCoversContract(method, changed), false, "different exact contract is not covered");
    assert.equal(reconcileInferredReturnTargetContract(policy, changed, [method], false).kind, "rejected", "incompatible inferred contracts reject");
  }
  assert.equal(reconcileInferredReturnTargetContract(policy, inferred, [method], true).kind, "rejected", "incomplete return evidence still rejects");
});

test("coverage does not authorize method identity replacement or captured environment erasure", () => {
  const otherMethod = csharpMethodValueType(owner, "other", "source.other", signature, [parameter.identity]);
  const otherEnvironment = csharpMethodValueType({ ...owner, id: "tsonic.shape:other-environment" }, "identity", "source.identity", signature, [parameter.identity]);
  for (const changed of [inferred, otherMethod, otherEnvironment]) {
    assert.equal(csharpMethodValueCoversContract(method, changed), true, "signature coverage is separate from storage conversion");
    assert.equal(selectCsharpConversion(policy, method, changed, "implicit").kind, "rejected", "concrete storage still requires its original method and environment");
    assert.equal(selectCsharpConversion(policy, method, changed, "explicit").kind, "rejected", "explicit casts cannot replace method identity or environment");
  }
  assert.equal(reconcileInferredReturnTargetContract(policy, inferred, [method, otherMethod], false).kind, "rejected", "distinct observed method identities cannot be merged");
});
