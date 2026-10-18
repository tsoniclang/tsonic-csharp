import assert from "node:assert/strict";
import test from "node:test";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "../../../dist/analysis/operations/conversion-admission.js";
import { elementSelectedTypes } from "../../../dist/analysis/operations/member-access.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpDelegateTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
const stringType = csharpStringTargetType();
const integerType = csharpSourcePrimitiveTargetType("int32");
const booleanType = csharpSourcePrimitiveTargetType("bool");
const narrow = csharpRuntimeUnionTargetType([stringType, integerType]);
const wide = csharpRuntimeUnionTargetType([integerType, booleanType, stringType]);
const mapping = selectCsharpConversion(policy, narrow, wide, "implicit");
assert.equal(mapping.kind, "union-map");
const incomplete = Object.freeze({ ...mapping, arms: mapping.arms.slice(1) });
const mappingRejected = { kind: "rejected", reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." };

function assertAdmitted(source, target, selection) {
  assert.equal(admitCsharpConversionSelection(policy, source, target, selection) === selection, true,
    "valid admission preserves the complete selected tree by identity");
}

function providerAdapter(inputType, resultType) {
  return Object.freeze({ kind: "static-method", id: "fixture.adapter", declaringType: stringType,
    targetName: "adapt", inputType, resultType });
}

test("nullable admission checks the recorded element pair and its complete selected conversion", () => {
  const source = csharpNullableTargetType(narrow);
  const target = csharpNullableTargetType(wide);
  const selected = Object.freeze({ kind: "nullable-map", sourceElement: narrow, targetElement: wide, conversion: mapping });
  assertAdmitted(source, target, selected);
  assert.deepEqual(admitCsharpConversionSelection(policy, source, target, { ...selected, conversion: incomplete }), mappingRejected);
  for (const invalid of [{ ...selected, sourceElement: wide }, { ...selected, targetElement: narrow }]) {
    assert.deepEqual(admitCsharpConversionSelection(policy, source, target, invalid), {
      kind: "rejected", reason: "Nullable conversion requires its exact sealed source and destination element carriers.",
    });
  }
});

test("runtime-union arm admission checks both the destination arm and its nested conversion", () => {
  const target = csharpRuntimeUnionTargetType([booleanType, wide]);
  const selected = Object.freeze({ kind: "implicit", proof: "runtime-union-arm", armIndex: 1,
    armType: wide, sourceToArm: mapping });
  assertAdmitted(narrow, target, selected);
  assert.deepEqual(admitCsharpConversionSelection(policy, narrow, target, { ...selected, sourceToArm: incomplete }), mappingRejected);
  for (const invalid of [{ ...selected, armIndex: 0 }, { ...selected, armType: narrow }]) {
    assert.deepEqual(admitCsharpConversionSelection(policy, narrow, target, invalid), {
      kind: "rejected", reason: "C# runtime-union construction requires one exact source arm and a renderable closed union carrier.",
    });
  }
});

test("generic TaskResolve argument admission preserves the complete unique nested injection tree", () => {
  const part = Object.freeze({ kind: "type-parameter", identity: "resolve:Part", name: "Part" });
  const number = csharpSourcePrimitiveTargetType("float64");
  const result = csharpRuntimeUnionTargetType([number, part]);
  const input = csharpRuntimeUnionTargetType([result, csharpTaskTargetType(result)]);
  const injection = selectCsharpConversion(policy, part, input, "implicit");
  assert.equal(injection.kind === "implicit" && injection.proof === "runtime-union-arm" &&
    injection.sourceToArm.kind === "implicit" && injection.sourceToArm.proof === "runtime-union-arm", true,
  "the canonical selector supplies both physical native constructors");
  assertAdmitted(part, input, injection);
  const source = csharpDelegateTargetType("System.Action", [input]);
  const target = csharpDelegateTargetType("System.Action", [part]);
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "adaptation" &&
    selected.parameterConversions.length === 1 && selected.parameterConversions[0].proof === "runtime-union-arm" &&
    selected.parameterConversions[0].sourceToArm.proof === "runtime-union-arm", true,
  "delegate contravariance consumes the same source-to-input injection, not a reversed or flattened pair");
  assertAdmitted(source, target, selected);
  const malformed = { ...injection, sourceToArm: { ...injection.sourceToArm, armIndex: 0 } };
  assert.equal(admitCsharpConversionSelection(policy, part, input, malformed).kind, "rejected",
    "a wrong inner arm remains rejected at admission");
  assert.equal(admitCsharpConversionSelection(policy, { ...part, identity: "foreign:Part" }, input, injection).kind, "rejected",
    "a foreign same-spelled binder cannot reuse a valid injection");
  const borrowed = { ...target, csharpDelegateSignature: { ...target.csharpDelegateSignature, parameterPassingModes: ["byref-readonly"] } };
  assert.equal(selectCsharpConversion(policy, source, borrowed, "implicit").kind, "rejected",
    "nested value adaptation does not relax an exact native managed-reference contract");
});

test("delegate admission uses contravariant parameter and covariant return carrier pairs", () => {
  const source = csharpDelegateTargetType("System.Func", [wide], narrow);
  const target = csharpDelegateTargetType("System.Func", [narrow], wide);
  const selected = Object.freeze({ kind: "delegate-adapter", strategy: "adaptation",
    parameterConversions: Object.freeze([mapping]), returnConversion: mapping });
  assertAdmitted(source, target, selected);
  for (const invalid of [
    { ...selected, parameterConversions: [incomplete] },
    { ...selected, returnConversion: incomplete },
  ]) assert.deepEqual(admitCsharpConversionSelection(policy, source, target, invalid), mappingRejected);
  assert.deepEqual(admitCsharpConversionSelection(policy, target, source, selected), mappingRejected);
  assert.deepEqual(admitCsharpConversionSelection(policy, source, target, { ...selected, parameterConversions: [] }), {
    kind: "rejected", reason: "C# delegate adaptation requires exact renderable source and target signatures.",
  });
});

test("delegate admission preserves void-return and native-binding selections", () => {
  const source = csharpDelegateTargetType("System.Func", [wide], narrow);
  const target = csharpDelegateTargetType("System.Action", [narrow]);
  assertAdmitted(source, target, Object.freeze({ kind: "delegate-adapter", strategy: "adaptation",
    parameterConversions: Object.freeze([mapping]), returnConversion: Object.freeze({ kind: "void-return" }) }));
  const delegate = csharpDelegateTargetType("System.Func", [narrow], narrow);
  assertAdmitted(delegate, delegate, Object.freeze({ kind: "delegate-adapter", strategy: "native-binding",
    parameterConversions: Object.freeze([{ kind: "identity" }]), returnConversion: Object.freeze({ kind: "identity" }) }));
});

test("provider adapters admit both source-to-input and result-to-target subtrees", () => {
  const selected = Object.freeze({ kind: "provider-argument-adapter", adapter: providerAdapter(wide, narrow),
    sourceToInput: mapping, resultToTarget: mapping });
  assertAdmitted(narrow, wide, selected);
  for (const invalid of [{ ...selected, sourceToInput: incomplete }, { ...selected, resultToTarget: incomplete }]) {
    assert.deepEqual(admitCsharpConversionSelection(policy, narrow, wide, invalid), mappingRejected);
  }
  const rejected = Object.freeze({ kind: "rejected", reason: "the child is not supported" });
  const ambiguous = Object.freeze({ kind: "ambiguous", candidateIds: ["first", "second"], reason: "the child is ambiguous" });
  for (const invalid of [rejected, ambiguous]) {
    const result = admitCsharpConversionSelection(policy, narrow, wide, { ...selected, sourceToInput: invalid });
    assert.equal(result === invalid, true, "a child failure is preserved rather than hidden by its wrapper");
  }
});

test("conversion admission handles deep trees, shared children and cycles without recursive descent", () => {
  const identity = Object.freeze({ kind: "identity" });
  const adapter = providerAdapter(narrow, narrow);
  let selected = identity;
  for (let depth = 0; depth < 4096; depth += 1) {
    selected = Object.freeze({ kind: "provider-argument-adapter", adapter, sourceToInput: selected, resultToTarget: identity });
  }
  assertAdmitted(narrow, narrow, selected);
  const shared = Object.freeze({ kind: "provider-argument-adapter", adapter, sourceToInput: selected, resultToTarget: selected });
  assertAdmitted(narrow, narrow, shared);
  const cyclic = { kind: "provider-argument-adapter", adapter, sourceToInput: identity, resultToTarget: identity };
  cyclic.sourceToInput = cyclic;
  assert.deepEqual(admitCsharpConversionSelection(policy, narrow, narrow, cyclic), {
    kind: "rejected", reason: "C# conversion admission requires a finite selected conversion tree.",
  });
});

test("call admission checks selected provider arguments and reports the exact source subject", () => {
  const callSubject = Object.freeze({});
  const mappingInput = Object.freeze({ kind: "by-value", sourceType: narrow, targetType: wide, conversion: mapping });
  const selected = { kind: "resolved", source: { call: callSubject },
    call: { origin: "provider", argumentMappings: [mappingInput] } };
  assert.equal(csharpSelectedCallConversionIssue(policy, selected), undefined);
  const issue = csharpSelectedCallConversionIssue(policy, { ...selected,
    call: { ...selected.call, argumentMappings: [{ ...mappingInput, conversion: incomplete }] } });
  assert.equal(issue.node === callSubject, true, "the issue is attached to the selected source call");
  assert.equal(issue.code, "CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN");
  assert.equal(issue.message, mappingRejected.reason);
  assert.equal(Object.isFrozen(issue), true);
  assert.equal(csharpSelectedCallConversionIssue(policy, { kind: "source-owned", source: { call: callSubject } }), undefined);
});

test("call admission checks each selected sequence element before publication", () => {
  const callSubject = Object.freeze({});
  const sequence = { targetElementType: wide, elements: [
    { type: narrow, conversion: mapping }, { type: narrow, conversion: mapping },
  ] };
  const selected = { kind: "resolved", source: { call: callSubject },
    call: { origin: "source-profile", sequenceArguments: [sequence] } };
  assert.equal(csharpSelectedCallConversionIssue(policy, selected), undefined);
  const issue = csharpSelectedCallConversionIssue(policy, { ...selected, call: { ...selected.call,
    sequenceArguments: [{ ...sequence, elements: [sequence.elements[0], { type: narrow, conversion: incomplete }] }] } });
  assert.equal(issue.node === callSubject, true, "the later element failure is retained at the selected source call");
  assert.equal(issue.code, "CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN");
  assert.equal(issue.message, mappingRejected.reason);
});

test("member admission issues retain rejected and ambiguous selections at their exact source subject", () => {
  const subject = Object.freeze({});
  for (const conversion of [mappingRejected, { kind: "ambiguous", reason: "ambiguous child", candidateIds: ["one", "two"] }]) {
    const issue = csharpOperationConversionIssue(subject, conversion, "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN");
    assert.equal(issue.node === subject, true, "the operation owner retains the exact subject");
    assert.equal(issue.code, "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN");
    assert.equal(issue.message, conversion.reason);
    assert.equal(Object.isFrozen(issue), true);
  }
  assert.equal(csharpOperationConversionIssue(subject, mapping, "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN"), undefined);
  assert.equal(csharpOperationConversionIssue(subject, undefined, "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN"), undefined);
});

test("optional project indexers admit present-value conversion before native absence is lifted", () => {
  const source = { receiver: { expression: {} }, accessMode: "read", optionalChain: true };
  const selected = { kind: "project-indexer", source, valueType: wide, selectedReadType: narrow };
  const noStorageQuery = () => { throw new Error("the selected indexer already supplies its exact native carriers"); };
  const indexPolicy = { ...policy, types: { resolveSelectedValue: () => undefined,
    resolveReadStorage: noStorageQuery, resolveSelectedResult: noStorageQuery } };
  const classification = elementSelectedTypes(indexPolicy, source, {}, selected);
  assert.equal(targetTypeRefEquals(classification.selectedResultType, csharpNullableTargetType(narrow)), true,
    "the operation result includes its native absence state");
  assert.equal(classification.flowReadConversion.kind, "union-map");
  assert.equal(classification.flowReadConversion.coverage, "target");
  assertAdmitted(wide, narrow, classification.flowReadConversion);
  assert.equal(elementSelectedTypes(indexPolicy, { ...source, accessMode: "write" }, {}, selected).flowReadConversion, undefined,
    "a write does not publish an unused read conversion");
});
