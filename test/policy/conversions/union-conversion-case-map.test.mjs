import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { selectCsharpUnionInjection } from "../../../dist/policy/conversions/union-relations.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTargetNamedType, csharpTaskTargetType, getCsharpRuntimeUnionArms, targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/index.js";

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

// The deleted csharpSourceUnionLayoutsMatch recognized two runtime-union layouts as one "logical" source union (return
// layout inference). The Host now publishes each union with its arms authored-first (C-2459) and C# keeps that order
// (R6): two orders are two distinct .NET carriers, and no array reinterpretation joins them.
test("each published union keeps its authored arm order; a permuted layout is a distinct carrier, never an array conversion", () => {
  const program = hostProgram(`
    export function forward(value: (string | number)[]): void {}
    export function backward(value: (number | string)[]): void {}
    export function nested(value: (boolean | string | number)[]): void {}
  `);
  const represent = representations(representationServices(program));
  const carrier = name => represented(represent.slot(program.ast.parameters(program.named(name))[0]));
  const source = carrier("forward");
  const target = carrier("backward");
  assert.deepEqual(getCsharpRuntimeUnionArms(source.element).map(targetTypeRefKey), [text, floating].map(targetTypeRefKey),
    "string | number -> Union<string, double>");
  assert.deepEqual(getCsharpRuntimeUnionArms(target.element).map(targetTypeRefKey), [floating, text].map(targetTypeRefKey),
    "number | string -> Union<double, string>: no sort normalizes the two orders (R6)");
  assert.equal(targetTypeRefEquals(source, target), false, "the native generic instantiations remain physically distinct");
  assert.equal(selectCsharpConversion(policy, source, target, "implicit")?.kind, "rejected",
    "a permuted layout never invents an array reinterpretation, copy or boxed conversion");
  assert.deepEqual(getCsharpRuntimeUnionArms(carrier("nested").element).map(targetTypeRefKey),
    [boolean, text, floating].map(targetTypeRefKey), "a three-arm union is flat and positional");
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

// Which arm a converted (non-identical) payload enters is a Host relation (C-2479 select-arm). Without it, C# proves
// only exact carrier identity and never searches for a convertible arm (AGENT-C1-NOTES D6, R6).
test("a native scalar conversion enters a union arm only through the Host-selected arm", () => {
  for (const [source, arm] of [[integer, wide], [derived, base]]) {
    const nested = csharpRuntimeUnionTargetType([reference("Unused"), csharpRuntimeUnionTargetType([arm, text])]);
    const searched = selectCsharpConversion(policy, source, nested, "implicit");
    assert.equal(searched.kind, "rejected", "no convertible-arm search without a Host arm");
    assert.equal(searched.reason, "C# runtime-union conversion requires the source representation to match one exact union arm.");
    const target = csharpRuntimeUnionTargetType([arm, text]);
    const convert = selected => selectCsharpConversion(policy, source, selected, "implicit");
    assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", convert), undefined,
      "without a Host arm the injection proves nothing beyond exact identity");
    const selected = selectCsharpUnionInjection(source, target, undefined, "implicit", convert, { kind: "present", index: 0 });
    assert.equal(selected.kind === "implicit" && selected.proof === "runtime-union-arm" && selected.armIndex === 0, true,
      "the Host-selected arm receives the payload");
    assert.equal(selected.sourceToArm.kind, "implicit", "the native leaf conversion is retained explicitly");
    assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", convert, { kind: "present", index: 1 }).kind,
      "rejected", "a Host arm whose payload has no CLR conversion is refused, not replaced by another arm");
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
    assert.equal(result.reason, "C# runtime-union conversion requires the source representation to match one exact union arm.",
      "C# never chooses among applicable arms; the Host relation selects the arm (C-2479)");
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
