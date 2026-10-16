import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpExpectedUseCollection } from "../../../dist/analysis/expected-types/collection.js";
import { collectCsharpExpectedNativeUseSites } from "../../../dist/analysis/expected-types/native-uses.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const floating = csharpSourcePrimitiveTargetType("float64");
const collection = () => createCsharpExpectedUseCollection({ ast: { kindName: () => "KindIdentifier" } });
const argument = effectiveIndex => ({ kind: "argument", sourceIndex: 0, effectiveIndex, parameterIndex: effectiveIndex });

test("one expression feeding distinct effective arguments retains both exact requested target and integer intent", () => {
  const values = collection();
  const expression = {};
  const call = {};
  values.record(expression, integer, "required", { owner: call, slot: argument(0) }, true);
  values.record(expression, floating, "required", { owner: call, slot: argument(1) });
  values.record(expression, integer, "required", { owner: call, slot: argument(0) }, true);
  const projection = values.seal();
  const sites = collectCsharpExpectedNativeUseSites(projection.requests);
  const first = sites.get(csharpNativeUseSite(call, argument(0), { target: integer }));
  const second = sites.get(csharpNativeUseSite(call, argument(1), { target: floating }));
  assert.equal(first.length === 1 && first[0].expression === expression && first[0].targetType === integer && first[0].exactInteger, true);
  assert.equal(second.length === 1 && second[0].targetType === floating && !second[0].exactInteger, true,
    "an exact integer request at another use cannot become this use's integer requirement");
  assert.equal(sites.requestsOf(expression).length, 2);
  assert.equal(sites.get(csharpNativeUseSite(call, { ...argument(0), parameterIndex: 1 }, { target: integer })).length, 0);
  assert.equal(sites.get(csharpNativeUseSite(call, argument(0), { target: floating })).length, 0);
  assert.equal(sites.get(csharpNativeUseSite(call, argument(0), { target: integer, mode: "explicit" })).length, 0);
  assert.deepEqual(projection.requiredExpectedType(expression).map(targetTypeRefKey), [floating, integer].map(targetTypeRefKey).sort());
  assert.equal(projection.exactIntegerConversion(expression, integer), true, "the retained aggregate view stays compatible with its existing consumer");
});

test("forwarded children retain every exact parent rather than choosing the first use of an expression", () => {
  const values = collection();
  const expression = {};
  const wrapper = {};
  const call = {};
  const first = csharpNativeUseSite(call, argument(0), { target: integer });
  const second = csharpNativeUseSite(call, argument(1), { target: integer });
  const slot = { kind: "operand", position: "only" };
  values.record(wrapper, integer, "required", { owner: call, slot: argument(0) });
  values.record(wrapper, integer, "required", { owner: call, slot: argument(1) });
  values.record(expression, integer, "required", { owner: wrapper, slot, forwardedFrom: first });
  values.record(expression, integer, "required", { owner: wrapper, slot, forwardedFrom: second });
  const projection = values.seal();
  const sites = collectCsharpExpectedNativeUseSites(projection.requests);
  const children = sites.get(csharpNativeUseSite(wrapper, slot, { target: integer }));
  assert.equal(children.length, 2);
  assert.equal(new Set(children.map(value => value.forwardedFrom.role)).size, 2);
  assert.equal(children.every(value => value.forwardedFrom.subject === call && value.expression === expression), true);
  assert.equal(sites.get(children[0].forwardedFrom)[0].expression === wrapper, true);
  assert.equal(sites.get(children[1].forwardedFrom)[0].expression === wrapper, true);
});

test("missing and withheld required requests remain explicit, distinct and immutable until final admission", () => {
  const values = collection();
  const owner = {};
  const expression = {};
  const reasons = ["argument-refused", "argument-unresolved", "argument-inconsistent", "argument-sequence"];
  for (const [index, withheld] of reasons.entries()) values.record(expression, integer, "required", { owner, slot: argument(index), withheld });
  values.record(expression, undefined, "required", { owner, slot: { kind: "receiver" } });
  values.record(undefined, integer, "required", { owner, slot: { kind: "initializer" } });
  values.record(expression, floating, "contextual");
  const projection = values.seal();
  const sites = collectCsharpExpectedNativeUseSites(projection.requests);
  assert.equal(sites.requests.length, 6);
  assert.equal(sites.pending.length, 6);
  assert.deepEqual(sites.pending.map(value => value.reason), [...reasons, "target-unresolved", "expression-unresolved"]);
  assert.equal(sites.pending.every(value => value.strength === "required" && Object.isFrozen(value) && Object.isFrozen(value.site)), true);
  assert.equal(sites.pending[4].targetType === undefined && sites.pending[5].expression === undefined, true);
  assert.equal(Object.hasOwn(sites, "expectedUse"), false, "no premature admitted physical representation");
  assert.equal(Object.isFrozen(sites) && Object.isFrozen(sites.requests) && Object.isFrozen(sites.pending), true);
  const list = sites.requestsOf(expression);
  assert.equal(Object.isFrozen(list) && sites.requestsOf(expression) === list, true, "indexed pure lookup, not filtering on read");
  assert.throws(() => values.record(expression, integer, "required"), /Expected-use collection is sealed/u);
  assert.throws(() => values.seal(), /Expected-use collection is sealed/u);
});

test("pending work keeps exact sites, skips superseded versions and publishes materialized views", () => {
  const values = collection();
  const expression = {};
  const owner = {};
  const demand = { owner, slot: { kind: "initializer" } };
  values.record(expression, integer, "contextual", demand);
  values.record(expression, integer, "required", demand, true);
  const pending = values.takePending();
  assert.equal(pending.expression === expression && pending.strength === "required" && pending.exactInteger && pending.site.subject === owner, true);
  assert.equal(values.takePending() === undefined, true, "the obsolete weaker request is not propagated");
  const projection = values.seal();
  const first = projection.expectedType(expression);
  assert.equal(Object.isFrozen(first) && projection.expectedType(expression) === first, true);
  const foreign = Object.defineProperty({}, "kind", { get() { throw Error("foreign syntax access"); } });
  assert.equal(projection.expectedType(foreign).length, 0);
  assert.equal(collectCsharpExpectedNativeUseSites(projection.requests).requestsOf(foreign).length, 0);
});
