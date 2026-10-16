import assert from "node:assert/strict";
import test from "node:test";
import { admitCsharpCallableParameterAdapters } from "../../../dist/analysis/callables/adapters.js";
import { selectCsharpCallableParameterAdapters } from "../../../dist/policy/conversions/callable-parameters.js";
import { csharpSourcePrimitiveTargetType, csharpNullableTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const host = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
const scalar = csharpSourcePrimitiveTargetType("string");
const unrelated = csharpSourcePrimitiveTargetType("boolean");
const parameter = (type, flags = {}) => ({ name: "value", passingMode: "by-value", type, ...flags });
const rest = type => parameter({ kind: "array", element: type }, { paramsArray: true });

test("rest adapters retain logical positions, exact conversion carriers and immutable segments", () => {
  const selected = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(scalar), rest(scalar)]);
  assert.deepEqual(selected.map(adapter => adapter.kind), ["rest-element", "rest"]);
  assert.equal(selected[0].parameterIndex, 0);
  assert.equal(selected[0].offset, 0);
  assert.equal(selected[1].segments[0].offset, 1);
  assert.equal(selected[1].segments[0].parameterIndex, 0);
  assert.equal(targetTypeRefEquals(selected[0].adapter.source, scalar), true, "rest projection preserves exact source carrier");
  assert.equal(targetTypeRefEquals(selected[0].adapter.target, scalar), true, "rest projection preserves exact destination carrier");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected[0]) && Object.isFrozen(selected[1].segments), true,
    "adapter and rest segments are immutable");
  assert.throws(() => { selected[1].segments[0].offset = 0; }, TypeError);
  const same = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [rest(scalar)]);
  assert.equal(same[0].kind, "value");
  assert.equal(same[0].adapter.conversion.kind, "identity");
  const empty = admitCsharpCallableParameterAdapters(host, [], [rest(scalar)]);
  assert.deepEqual(empty[0].segments, []);
  const optional = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(csharpNullableTargetType(scalar), { optional: true })]);
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
    [[parameter(scalar, { passingMode: "byref-readwrite" })], [parameter(scalar)]],
  ]) assert.equal(admitCsharpCallableParameterAdapters(host, source, destination) === undefined, true,
    "an invalid native parameter correspondence is refused");
});

test("exact native parameter forwarding retains by-reference modes without a second selector", () => {
  for (const passingMode of ["byref-readwrite", "byref-readonly", "byref-writeonly-must-init"]) {
    const source = [parameter(scalar, { passingMode })];
    const target = [parameter(scalar, { passingMode, optional: true })];
    const selected = admitCsharpCallableParameterAdapters(host, source, target);
    assert.equal(selected?.length === 1 && selected[0].kind === "value" && selected[0].parameterIndex === 0 &&
      selected[0].adapter.conversion.kind === "identity", true, `exact ${passingMode} forwarding remains native`);
    assert.equal(selectCsharpCallableParameterAdapters(source, target, []) === undefined, true,
      `unadmitted ${passingMode} identity is not manufactured by policy`);
  }
});
