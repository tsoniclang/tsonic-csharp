import assert from "node:assert/strict";
import test from "node:test";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { sealCsharpConversionUses } from "../../../dist/analysis/conversions/use-admission.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "../../../dist/analysis/operations/conversion-admission.js";
import { elementSelectedTypes } from "../../../dist/analysis/operations/member-access.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

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

test("conversion admission validates integer refinements, absence and provider storage before publication", () => {
  const unsigned = csharpSourcePrimitiveTargetType("uint32");
  const refinement = Object.freeze({ kind: "integer-refinement", source: "int32", target: "uint32", proof: "nonnegative" });
  assertAdmitted(integerType, unsigned, refinement);
  for (const [source, target, selected] of [
    [booleanType, unsigned, refinement],
    [integerType, integerType, refinement],
    [integerType, unsigned, { ...refinement, proof: "wrong" }],
    [integerType, csharpNullableTargetType(integerType), { kind: "absence" }],
  ]) assert.equal(admitCsharpConversionSelection(policy, source, target, selected).kind, "rejected",
    "an invalid native conversion is refused by admission, never by the planner");
  const source = csharpNullableTargetType(integerType);
  const target = csharpNullableTargetType(unsigned);
  const selected = Object.freeze({ kind: "lifted-provider-argument-adapter", sourceElementType: integerType,
    targetElementType: unsigned, adapter: providerAdapter(integerType, unsigned) });
  assertAdmitted(source, target, selected);
  assert.equal(admitCsharpConversionSelection(policy, source, target, { ...selected, sourceElementType: booleanType }).kind,
    "rejected", "a provider's lifted adapter cannot replace its admitted native element pair");
  const unsupported = { kind: "cast", proof: "reference" };
  const refused = admitCsharpConversionSelection(policy, integerType, { kind: "opaque", id: "unrenderable" }, unsupported);
  assert.equal(refused.kind, "rejected", "an unrenderable required native conversion is refused before sealing");
  assert.equal(refused.reason, "C# conversion requires a renderable target type.", "the owning failure remains precise");
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

test("optional native call completion admission retains the exact present-to-optional pair", () => {
  const expression = Object.freeze({});
  const target = csharpNullableTargetType(booleanType);
  const requiredRecords = [];
  const completion = Object.freeze({ source: booleanType, target });
  const use = Object.freeze({ kind: "value", expression, carrier: target,
    completion: Object.freeze({ kind: "value", type: target }), children: Object.freeze([]),
    evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([]) }) });
  const pairs = [];
  const admitted = sealCsharpConversionUses({ entries: [{ use }] }, {
    selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined },
  }, (node, source, target) => ({
    key: "same-carrier", classification: { source, target, selection: selectCsharpConversion(policy, source, target, "implicit") },
  }), (node, source, target) => {
    pairs.push({ node, source, target });
    return selectCsharpConversion(policy, source, target, "implicit");
  }, requiredRecords, [], new Map([[expression, completion]]));
  assert.equal(admitted.issues.length, 0, "a valid native bool-to-Nullable<bool> branch is admitted before sealing");
  assert.equal(pairs.length === 1 && pairs[0].node === expression &&
    targetTypeRefEquals(pairs[0].source, booleanType) && targetTypeRefEquals(pairs[0].target, target), true,
  "the actual selected native present result is not confused with the already-lifted expression result");
  assert.equal(requiredRecords.some(record => record.family === "conversion" && record.subject === expression &&
    targetTypeRefEquals(record.source, booleanType) && targetTypeRefEquals(record.target, target)), true,
  "the seal requires the exact renderer-consumed native completion conversion");
});

test("authored absence into required native storage retains its exact refusal at admission", () => {
  const expression = Object.freeze({});
  const source = csharpAbsenceTargetType();
  const selected = selectCsharpConversion(policy, source, integerType, "implicit");
  const requiredRecords = [];
  const use = Object.freeze({ kind: "converted", expression, carrier: integerType, target: integerType, mode: "implicit",
    input: Object.freeze({ kind: "value", type: source }), completion: Object.freeze({ kind: "value", type: integerType }),
    children: Object.freeze([]), evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([]) }) });
  const admitted = sealCsharpConversionUses({ entries: [{ use }] }, {
    selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined },
  }, (node, from, target) => ({
    key: "authored-absence", classification: { source: from, target, selection: selected },
  }), () => selected, requiredRecords, [], new Map());
  assert.equal(selected.kind === "rejected" && admitted.issues.length === 1, true,
    "native declaration defaults never waive an authored incompatible absence conversion");
  assert.equal(admitted.issues[0].node === expression && admitted.issues[0].code === "CSHARP_UNSUPPORTED_AST" &&
    admitted.issues[0].message === selected.reason, true, "admission retains the exact reachable source refusal and subject");
});
