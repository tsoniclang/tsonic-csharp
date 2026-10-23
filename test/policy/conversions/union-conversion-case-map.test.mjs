import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { csharpSourceUnionLayoutsMatch } from "../../../dist/policy/conversions/union-relations.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTargetNamedType, csharpTaskTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const wide = csharpSourcePrimitiveTargetType("int64");
const floating = csharpSourcePrimitiveTargetType("float64");
const text = csharpStringTargetType();
const boolean = csharpSourcePrimitiveTargetType("bool");
const reference = name => csharpTargetNamedType(`union.fixture.${name}`, undefined,
  { kind: "named", name }, { allowsRefLikeTypeArguments: [] });
const base = reference("Base");
const otherBase = reference("OtherBase");
const derived = reference("Derived");
const policy = { projectTypes: { directSupertypes: carrier =>
  targetTypeRefEquals(carrier, derived) ? [base, otherBase] : [] },
providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
const parameter = Object.freeze({ kind: "type-parameter", identity: "union.fixture:Value", name: "Value" });

test("logical source union correspondence selects a physical producer layout, never an array conversion", () => {
  const first = csharpRuntimeUnionTargetType([text, floating]);
  const second = csharpRuntimeUnionTargetType([floating, text]);
  const source = { kind: "array", element: first };
  const target = { kind: "array", element: second };
  assert.equal(csharpSourceUnionLayoutsMatch(source, target), true,
    "the producer may publish its actual unique union layout for the same logical source array");
  assert.equal(targetTypeRefEquals(source, target), false, "the native generic instantiations remain physically distinct");
  assert.equal(selectCsharpConversion(policy, source, target, "implicit")?.kind, "rejected",
    "layout correspondence never invents an array reinterpretation, copy or boxed conversion");
  assert.equal(csharpSourceUnionLayoutsMatch({ kind: "array", element: csharpRuntimeUnionTargetType([text, integer]) }, target), false,
    "different numeric native carriers are not a source-layout permutation");
  assert.equal(csharpSourceUnionLayoutsMatch({ kind: "array", element: first, rank: 2 }, target), false,
    "native array rank remains exact");
  assert.equal(csharpSourceUnionLayoutsMatch(csharpNullableTargetType(source), target), false,
    "logical layout cannot remove an actual native absence state");
  assert.equal(csharpSourceUnionLayoutsMatch(csharpRuntimeUnionTargetType([integer, integer]),
    csharpRuntimeUnionTargetType([integer, text])), false, "ambiguous physical arm occurrences are not normalized away");
  const nested = csharpRuntimeUnionTargetType([boolean, first]);
  const flat = csharpRuntimeUnionTargetType([floating, boolean, text]);
  assert.equal(csharpSourceUnionLayoutsMatch(nested, flat), true,
    "nested and flattened logical alternatives retain a unique complete native-leaf correspondence");
});
const forms = [
  ["scalar", integer],
  ["class", derived],
  ["struct", csharpTargetNamedType("union.fixture.Record", undefined, { kind: "named", name: "Record" },
    { allowsRefLikeTypeArguments: [], valueType: true })],
  ["generic parameter", parameter],
  ["reference", text],
  ["delegate", csharpDelegateTargetType("System.Func", [integer, integer])],
  ["Task", csharpTaskTargetType(integer)],
  ["array", Object.freeze({ kind: "array", element: integer })],
  ["tuple", Object.freeze({ kind: "tuple", elements: Object.freeze([integer, text]) })],
];

for (const [name, source] of forms) {
  for (const depth of [1, 2, 4]) {
    test(`${name} enters one exact physical union path at depth ${depth} without changing its payload`, () => {
      let target = source;
      for (let index = 0; index < depth; index += 1)
        target = csharpRuntimeUnionTargetType([reference(`Unused${index}`), target]);
      const selected = selectCsharpConversion(policy, source, target, "implicit");
      let current = selected;
      for (let index = 0; index < depth; index += 1) {
        assert.equal(current.kind === "implicit" && current.proof === "runtime-union-arm", true,
          "every physical union layer is selected by the same path owner");
        assert.equal(current.armIndex, 1, "the complete selected path preserves native arm positions");
        current = current.sourceToArm;
      }
      assert.equal(current.kind, "identity", "the native payload is not boxed, copied into an array or adapted");
      assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
        "independent boundary admission preserves the complete selected proof");
    });
  }
}

test("a complete union used as one exact native arm is not needlessly decomposed", () => {
  const source = csharpRuntimeUnionTargetType([integer, text]);
  const target = csharpRuntimeUnionTargetType([source, boolean]);
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind === "implicit" && selected.proof === "runtime-union-arm", true,
    "atomic exact containment wins over a per-leaf dispatcher");
  assert.equal(targetTypeRefEquals(selected.armType, source), true, "the actual nested physical carrier remains intact");
  assert.equal(selected.sourceToArm.kind, "identity", "no tag inspection or payload reconstruction is invented");
  assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
    "the unchanged complete payload is admitted");
});

test("unique native scalar conversions enter nested unions through the one candidate owner", () => {
  for (const [source, arm] of [[integer, wide], [derived, base]]) {
    const target = csharpRuntimeUnionTargetType([reference("Unused"), csharpRuntimeUnionTargetType([arm, text])]);
    const selected = selectCsharpConversion(policy, source, target, "implicit");
    assert.equal(selected.kind === "implicit" && selected.proof === "runtime-union-arm", true,
      "the outer target has one exact native payload conversion");
    assert.equal(selected.sourceToArm.proof, "runtime-union-arm", "native conversion reaches the complete nested path");
    assert.equal(selected.sourceToArm.sourceToArm.kind, "implicit", "the native leaf conversion is retained explicitly");
    assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
      "the full conversion tree is independently admitted before sealing");
  }
});

test("exact payload identity wins over convertible arms and ambiguous conversions have no order winner", () => {
  const exact = csharpRuntimeUnionTargetType([base, derived]);
  const selected = selectCsharpConversion(policy, derived, exact, "implicit");
  assert.equal(selected.kind === "implicit" && selected.armIndex === 1 && selected.sourceToArm.kind === "identity", true,
    "an exact physical arm wins without converting a live reference");
  for (const arms of [[base, otherBase], [otherBase, base], [wide, floating], [floating, wide]]) {
    const source = targetTypeRefEquals(arms[0], wide) || targetTypeRefEquals(arms[0], floating) ? integer : derived;
    const result = selectCsharpConversion(policy, source, csharpRuntimeUnionTargetType(arms), "implicit");
    assert.equal(result.kind, "rejected", "equally applicable native conversions do not depend on source arm order");
    assert.equal(result.reason, "C# runtime-union conversion has more than one applicable native payload arm.",
      "the one union owner provides the precise ambiguity refusal");
  }
});

test("nullable value, reference and absent inputs retain one native absence state", () => {
  for (const source of [integer, text]) {
    const union = csharpRuntimeUnionTargetType([source, boolean]);
    const target = csharpNullableTargetType(union);
    const nullable = csharpNullableTargetType(source);
    const selected = selectCsharpConversion(policy, nullable, target, "implicit");
    assert.equal(selected.kind, "nullable-map", "native absence and present payload are mapped at their actual boundary");
    assert.equal(admitCsharpConversionSelection(policy, nullable, target, selected) === selected, true,
      "both absence states consume the same exact admitted native correspondence");
    assert.equal(selectCsharpConversion(policy, csharpAbsenceTargetType(), target, "implicit").kind, "absence",
      "source absence does not manufacture a second null/undefined tag");
    assert.equal(selectCsharpConversion(policy, nullable, union, "implicit").kind, "rejected",
      "an absent source cannot enter nonnullable native storage");
  }
});

test("union widening, reordering and nested mappings preserve every existing source payload", () => {
  const source = csharpRuntimeUnionTargetType([text, derived]);
  const target = csharpRuntimeUnionTargetType([csharpRuntimeUnionTargetType([base, boolean]), text]);
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind, "union-map", "existing exact/reference coverage is selected, not generalized value boxing");
  assert.equal(selected.arms.length, 2, "every original source arm remains covered");
  assert.equal(selected.arms[0].target.length === 1 && selected.arms[0].target[0].index === 1, true,
    "the text payload is reordered by its exact path");
  assert.equal(selected.arms[1].target.length === 2 && selected.arms[1].target.every(step => step.index === 0), true,
    "the derived reference keeps the exact nested base path");
  assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
    "source-covered native reference mapping retains independent admission");
  assert.equal(selectCsharpConversion(policy, target, source, "implicit").kind, "rejected",
    "a genuine excluded source variant cannot silently disappear");
});

test("array, Task and foreign generic carriers are not repaired by copies, awaiting or name matching", () => {
  const foreign = Object.freeze({ ...parameter, identity: "union.fixture:ForeignValue" });
  for (const [source, arm] of [
    [Object.freeze({ kind: "array", element: integer }), Object.freeze({ kind: "array", element: wide })],
    [csharpTaskTargetType(integer), csharpTaskTargetType(wide)],
    [foreign, parameter],
  ]) {
    const selected = selectCsharpConversion(policy, source, csharpRuntimeUnionTargetType([arm, text]), "implicit");
    assert.equal(selected.kind, "rejected", "only an actual native relation may change the complete payload carrier");
  }
});
