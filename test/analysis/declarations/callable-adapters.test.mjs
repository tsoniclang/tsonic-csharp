import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCallableParameterAdapters } from "../../../dist/analysis/callables/adapters.js";
import { csharpSourcePrimitiveTargetType, csharpNullableTargetType } from "../../../dist/target-model/types/index.js";

const host = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
const scalar = csharpSourcePrimitiveTargetType("string");
const unrelated = csharpSourcePrimitiveTargetType("boolean");
const parameter = (type, flags = {}) => ({ name: "value", passingMode: "by-value", type, ...flags });
const rest = type => parameter({ kind: "array", element: type }, { paramsArray: true });

test("rest adapters retain logical positions, exact conversion carriers and immutable segments", () => {
  const selected = selectCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(scalar), rest(scalar)]);
  assert.deepEqual(selected.map(adapter => adapter.kind), ["rest-element", "rest"]);
  assert.equal(selected[0].parameterIndex, 0);
  assert.equal(selected[0].offset, 0);
  assert.equal(selected[1].segments[0].offset, 1);
  assert.equal(selected[1].segments[0].parameterIndex, 0);
  assert.deepEqual(selected[0].adapter.source, scalar);
  assert.deepEqual(selected[0].adapter.target, scalar);
  assert.ok(Object.isFrozen(selected) && Object.isFrozen(selected[0]) && Object.isFrozen(selected[1].segments));
  assert.throws(() => { selected[1].segments[0].offset = 0; }, TypeError);
  const same = selectCsharpCallableParameterAdapters(host, [rest(scalar)], [rest(scalar)]);
  assert.equal(same[0].kind, "value");
  assert.equal(same[0].adapter.conversion.kind, "identity");
  const empty = selectCsharpCallableParameterAdapters(host, [], [rest(scalar)]);
  assert.deepEqual(empty[0].segments, []);
  const optional = selectCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(csharpNullableTargetType(scalar), { optional: true })]);
  assert.equal(optional[0].kind, "rest-element");
  assert.equal(optional[0].optional, true);
});

test("rest adapters reject malformed sequence positions and unproved native representations", () => {
  for (const [source, destination] of [
    [[rest(scalar), parameter(scalar)], [rest(scalar)]],
    [[rest(scalar)], [rest(scalar), parameter(scalar)]],
    [[parameter(scalar, { paramsArray: true })], [rest(scalar)]],
    [[rest(scalar)], [rest(unrelated)]],
    [[], [parameter(scalar)]],
    [[parameter(scalar, { passingMode: "by-ref" })], [parameter(scalar)]],
  ]) assert.equal(selectCsharpCallableParameterAdapters(host, source, destination), undefined);
});
