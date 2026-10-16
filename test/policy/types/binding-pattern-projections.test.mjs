import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpBindingPatternDefault, selectCsharpBindingPatternProjection } from "../../../dist/policy/types/objects/binding-projection-policy.js";
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
  assert.equal(arraySource.kind === "source" && arraySource.source.sourceCarrier === array, true);
  assert.equal(tupleSource.kind === "source" && tupleSource.source.bindingCarrier === tuple, true);
  const unused = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 0, rest: false, hasDefault: true });
  const planned = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 1, rest: false, hasDefault: true });
  assert.equal(unused.kind === "element" && unused.element.kind === "array-element" && unused.element.elementCarrier === integer &&
    unused.element.tupleDefault.kind === "unused", true, "present tuple element does not execute its default");
  assert.equal(planned.kind === "element" && planned.element.tupleDefault.kind === "planned" &&
    planned.element.tupleDefault.carrier === integer, true, "optional tuple default uses the present carrier");
  assert.equal(Object.isFrozen(planned) && Object.isFrozen(planned.element) && Object.isFrozen(planned.element.tupleDefault), true);
  const tupleRest = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: tuple, index: 1, rest: true, hasDefault: false });
  assert.equal(tupleRest.kind === "element" && tupleRest.element.kind === "tuple-rest" &&
    tupleRest.element.restCarrier.elements.length === 1 && tupleRest.element.restCarrier.elements[0] === tuple.elements[1], true);
  const arrayRest = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: arraySource.source.bindingCarrier,
    index: 1, rest: true, hasDefault: false });
  assert.equal(arrayRest.kind === "element" && arrayRest.element.kind === "array-rest" && arrayRest.element.restCarrier === array, true);
  assert.equal(selectCsharpBindingPatternDefault(integer).kind, "unused");
  assert.equal(selectCsharpBindingPatternDefault(csharpNullableTargetType(integer)).carrier === integer, true);
});

test("source and object member selection never invent missing finalized evidence", () => {
  const selected = member("selected");
  const source = shape([selected]);
  const object = selectCsharpBindingPatternProjection({ kind: "object-source", shape: source, sourceOwned: true });
  assert.equal(object.kind === "source" && object.source.kind === "object-shape-source" && object.source.shape === source, true);
  const exact = selectCsharpBindingPatternProjection({ kind: "object-member", shape: source, sourceName: "selected", description: "Property" });
  assert.equal(exact.kind === "element" && exact.element.member === selected, true);
  const missing = selectCsharpBindingPatternProjection({ kind: "object-member", shape: source, sourceName: "missing", description: "Property" });
  assert.equal(missing.kind === "unresolved" && missing.reasons.length === 1, true);
  assert.equal(selectCsharpBindingPatternProjection({ kind: "array-source", carrier: undefined }).kind, "unresolved");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "array-source", carrier: integer }).kind, "unresolved");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "object-source", shape: undefined, sourceOwned: false }).kind, "unresolved");
  const owned = selectCsharpBindingPatternProjection({ kind: "object-source", shape: undefined, sourceOwned: true });
  assert.equal(owned.kind === "source" && owned.source.kind === "source-owned-source", true);
  assert.equal(selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "$invalid", stringLiteral: true }).kind, "unresolved");
  assert.equal(selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName: "valid", stringLiteral: true }).kind, "element");
});

test("rest projections preserve native member correspondence and every mismatch", () => {
  const first = member("first");
  const second = member("second");
  const source = shape([first, second]);
  const restMember = member("second");
  const selected = selectCsharpBindingPatternProjection({ kind: "object-rest", source, rest: shape([restMember]),
    extractedNames: new Set(["first"]), description: "Object rest" });
  assert.equal(selected.kind === "element" && selected.element.members.length === 1 &&
    selected.element.members[0].source === second && selected.element.members[0].rest === restMember, true);
  assert.equal(Object.isFrozen(selected.element.members) && Object.isFrozen(selected.element.members[0]), true);
  const stale = selectCsharpBindingPatternProjection({ kind: "object-rest", source, rest: shape([first]),
    extractedNames: new Set(["first"]), description: "Object rest" });
  assert.equal(stale.kind === "unresolved" && stale.reasons[0].includes("must exclude"), true);
  const invalid = selectCsharpBindingPatternProjection({ kind: "object-rest", source,
    rest: shape([member("first", floating), member("second", floating)]), extractedNames: new Set(), description: "Object rest" });
  assert.equal(invalid.kind === "unresolved" && invalid.reasons.length === 2 &&
    invalid.reasons.every(reason => reason.includes("matching finalized")), true, "all invalid members remain reported");
});
