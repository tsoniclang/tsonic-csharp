import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpBindingPatternDefault, selectCsharpBindingPatternProjection } from "../../../dist/policy/types/objects/binding-projection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const floating = csharpSourcePrimitiveTargetType("float64");
const tuple = Object.freeze({ kind: "tuple", elements: Object.freeze([integer, csharpNullableTargetType(integer)]) });
const array = Object.freeze({ kind: "array", element: integer });
const member = (name, type = integer) => Object.freeze({ sourceKey: Object.freeze({ kind: "property", name }),
  sourceName: name, targetName: name, memberKind: "property", type });
const shape = members => Object.freeze({ targetType: integer, members: Object.freeze(members) });

test("final array and tuple projections retain their exact carriers and default disposition", () => {
  const arraySource = selectCsharpBindingPatternProjection({ kind: "array-source", carrier: array });
  const tupleSource = selectCsharpBindingPatternProjection({ kind: "array-source", carrier: tuple });
  assert.equal(arraySource.kind === "source" && arraySource.source.sourceCarrier === array, true, "binding-pattern-projections:18: arraySource.kind === \"source\" && arraySource.source.sourceCarrier === array");
  assert.equal(tupleSource.kind === "source" && tupleSource.source.bindingCarrier === tuple, true, "binding-pattern-projections:19: tupleSource.kind === \"source\" && tupleSource.source.bindingCarrier === tuple");
  const unused = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 0, rest: false, hasDefault: true });
  const planned = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 1, rest: false, hasDefault: true });
  assert.equal(unused.kind === "element" && unused.element.kind === "array-element" && unused.element.elementCarrier === integer &&
    unused.element.tupleDefault.kind === "unused", true, "present tuple element does not execute its default");
  assert.equal(planned.kind === "element" && planned.element.tupleDefault.kind === "planned" &&
    planned.element.tupleDefault.carrier === integer, true, "optional tuple default uses the present carrier");
  assert.equal(Object.isFrozen(planned) && Object.isFrozen(planned.element) && Object.isFrozen(planned.element.tupleDefault), true, "binding-pattern-projections:26: Object.isFrozen(planned) && Object.isFrozen(planned.element) && Object.isFrozen(planned.el");
  const tupleRest = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 1, rest: true, hasDefault: false });
  assert.equal(tupleRest.kind === "element" && tupleRest.element.kind === "tuple-rest" &&
    tupleRest.element.restCarrier.elements.length === 1 && tupleRest.element.restCarrier.elements[0] === tuple.elements[1], true, "binding-pattern-projections:29: tupleRest.kind === \"element\" && tupleRest.element.kind === \"tuple-rest\" && tupleRest.eleme");
  const arrayRest = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: arraySource.source.bindingCarrier,
    index: 1, rest: true, hasDefault: false });
  assert.equal(arrayRest.kind === "element" && arrayRest.element.kind === "array-rest" && arrayRest.element.restCarrier === array, true, "binding-pattern-projections:32: arrayRest.kind === \"element\" && arrayRest.element.kind === \"array-rest\" && arrayRest.eleme");
  assert.equal(selectCsharpBindingPatternDefault(integer).kind, "unused", "binding-pattern-projections:33: selectCsharpBindingPatternDefault(integer).kind");
  assert.equal(selectCsharpBindingPatternDefault(csharpNullableTargetType(integer)).carrier === integer, true, "binding-pattern-projections:34: selectCsharpBindingPatternDefault(csharpNullableTargetType(integer)).carrier === integer");
});

test("source and object member selection never invent missing finalized evidence", () => {
  const selected = member("selected");
  const source = shape([selected]);
  const object = selectCsharpBindingPatternProjection({ kind: "object-source", shape: source, sourceOwned: true });
  assert.equal(object.kind === "source" && object.source.kind === "object-shape-source" && object.source.shape === source, true, "binding-pattern-projections:41: object.kind === \"source\" && object.source.kind === \"object-shape-source\" && object.source.");
  const exact = selectCsharpBindingPatternProjection({ kind: "object-member", shape: source, sourceName: "selected", description: "Property", permitsAbsence: false });
  assert.equal(exact.kind === "element" && exact.element.member === selected, true, "binding-pattern-projections:43: exact.kind === \"element\" && exact.element.member === selected");
  const missing = selectCsharpBindingPatternProjection({ kind: "object-member", shape: source, sourceName: "missing", description: "Property", permitsAbsence: false });
  assert.equal(missing.kind === "unresolved" && missing.reasons.length === 1, true, "binding-pattern-projections:45: missing.kind === \"unresolved\" && missing.reasons.length === 1");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "array-source", carrier: undefined }).kind, "unresolved", "binding-pattern-projections:46: selectCsharpBindingPatternProjection({ kind: \"array-source\", carrier: undefined }).kind");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "array-source", carrier: integer }).kind, "unresolved", "binding-pattern-projections:47: selectCsharpBindingPatternProjection({ kind: \"array-source\", carrier: integer }).kind");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "object-source", shape: undefined, sourceOwned: false }).kind, "unresolved", "binding-pattern-projections:48: selectCsharpBindingPatternProjection({ kind: \"object-source\", shape: undefined, sourceOwne");
  const owned = selectCsharpBindingPatternProjection({ kind: "object-source", shape: undefined, sourceOwned: true });
  assert.equal(owned.kind === "source" && owned.source.kind === "source-owned-source", true, "binding-pattern-projections:50: owned.kind === \"source\" && owned.source.kind === \"source-owned-source\"");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "$invalid", stringLiteral: true }).kind, "unresolved", "binding-pattern-projections:51: selectCsharpBindingPatternProjection({ kind: \"source-owned-member\", sourceName: \"$invalid\"");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "valid", stringLiteral: true }).kind, "element", "binding-pattern-projections:52: selectCsharpBindingPatternProjection({ kind: \"source-owned-member\", sourceName: \"valid\", s");
});

test("rest projections preserve native member correspondence and every mismatch", () => {
  const first = member("first");
  const second = member("second");
  const source = shape([first, second]);
  const restMember = member("second");
  const selected = selectCsharpBindingPatternProjection({ kind: "object-rest", source, rest: shape([restMember]),
    extractedNames: new Set(["first"]), description: "Object rest" });
  assert.equal(selected.kind === "element" && selected.element.members.length === 1 &&
    selected.element.members[0].source === second && selected.element.members[0].rest === restMember, true, "binding-pattern-projections:63: selected.kind === \"element\" && selected.element.members.length === 1 && selected.element.m");
  assert.equal(Object.isFrozen(selected.element.members) && Object.isFrozen(selected.element.members[0]), true, "binding-pattern-projections:64: Object.isFrozen(selected.element.members) && Object.isFrozen(selected.element.members[0])");
  const stale = selectCsharpBindingPatternProjection({ kind: "object-rest", source, rest: shape([first]),
    extractedNames: new Set(["first"]), description: "Object rest" });
  assert.equal(stale.kind === "unresolved" && stale.reasons[0].includes("must exclude"), true, "binding-pattern-projections:67: stale.kind === \"unresolved\" && stale.reasons[0].includes(\"must exclude\")");
  const invalid = selectCsharpBindingPatternProjection({ kind: "object-rest", source,
    rest: shape([member("first", floating), member("second", floating)]), extractedNames: new Set(), description: "Object rest" });
  assert.equal(invalid.kind === "unresolved" && invalid.reasons.length === 2 &&
    invalid.reasons.every(reason => reason.includes("matching finalized")), true, "all invalid members remain reported");
});

test("known absence requires both a closed missing member and checked optional permission", () => {
  const request = { kind: "object-member", shape: shape([]), sourceName: "missing", description: "Property", permitsAbsence: true };
  const absent = selectCsharpBindingPatternProjection(request);
  assert.equal(absent.kind === "element" && absent.element.kind === "object-shape-absence", true,
    "an exactly missing optional member has one explicit native-absence extraction");
  assert.equal(Object.isFrozen(absent) && Object.isFrozen(absent.element), true, "the final absence selection is frozen");
  assert.equal(selectCsharpBindingPatternProjection({ ...request, permitsAbsence: false }).kind, "unresolved",
    "physical absence alone never permits a mandatory member");
  const present = member("missing");
  const selected = selectCsharpBindingPatternProjection({ ...request, shape: shape([present]) });
  assert.equal(selected.kind === "element" && selected.element.kind === "object-shape-member" && selected.element.member === present,
    true, "checked optionality never discards a physically present value");
  const ambiguous = selectCsharpBindingPatternProjection({ ...request, shape: shape([present, present]) });
  assert.equal(ambiguous.kind, "unresolved", "ambiguous physical members are never treated as absent");
  const { permitsAbsence, ...retired } = request;
  assert.throws(() => selectCsharpBindingPatternProjection(retired), /requires its checked absence permission/u,
    "the retired object-member request without a checked permission has no fallback form");
});

test("the target policy owns missing source-owned rest and default correspondence without inventing a carrier", () => {
  const rest = selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "tail", stringLiteral: false, rest: true });
  const defaulted = selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "value", stringLiteral: false, hasDefault: true });
  assert.equal(rest.kind === "unresolved" && rest.reasons.length === 1 && rest.reasons[0] ===
    "Object rest destructuring requires finalized provider object-spread semantics before C# emission.", true, "binding-pattern-projections:78: rest.kind === \"unresolved\" && rest.reasons.length === 1 && rest.reasons[0] === \"Object res");
  assert.equal(defaulted.kind === "unresolved" && defaulted.reasons.length === 1 && defaulted.reasons[0] ===
    "Destructuring defaults require finalized undefined/default-value semantics before C# emission.", true, "binding-pattern-projections:80: defaulted.kind === \"unresolved\" && defaulted.reasons.length === 1 && defaulted.reasons[0] ");
});
