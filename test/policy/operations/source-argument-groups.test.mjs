import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceArgumentGrouping } from "../../../dist/policy/operations/members/source-argument-groups.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const sequence = Object.freeze({ kind: "array", element: scalar });
const required = Object.freeze({ name: "value", type: scalar, passingMode: "by-value" });
const optional = Object.freeze({ ...required, optional: true });
const rest = Object.freeze({ name: "values", type: sequence, passingMode: "by-value", paramsArray: true });

// A Host call selection (facts.selections.call): argument correspondence and the selected signature's parameters.
function fixture(forms, parameters, exactArity = false) {
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const bindings = forms.map((form, index) => {
    const parameterIndex = restIndex < 0 ? index : Math.min(index, restIndex);
    return { argument: { label: `argument${index}` }, argumentIndex: index, effectiveIndex: index, form, parameterIndex,
      mode: form === "spread-sequence" ? "spread" : parameterIndex === restIndex ? "rest-element" : "positional" };
  });
  return { parameters, exactArity, types: bindings.map(binding => binding.form === "spread-sequence" ? sequence : scalar),
    source: { use: {}, arguments: bindings, parameters: parameters.map((parameter, index) => ({ name: `arg${index}`,
      kind: parameter.paramsArray ? "rest" : parameter.optional ? "optional" : "required", type: { kind: "primitive", primitive: "float64" } })) } };
}

function select(input) {
  return selectCsharpSourceArgumentGrouping(input.source, input.parameters, input.types, input.exactArity);
}

function alterBinding(input, index, changed) {
  return { ...input, source: { ...input.source, arguments: input.source.arguments.map((binding, at) =>
    at === index ? { ...binding, ...changed } : binding) } };
}

test("source grouping carries exact original source, effective and source/native parameter keys", () => {
  const input = fixture(["value", "spread-sequence", "value"], [required, rest]);
  const grouping = select(input);
  assert.equal(grouping.kind, "grouped");
  assert.deepEqual(grouping.arguments.map(entry => [entry.sourceArgumentIndex, entry.effectiveArgumentIndex, entry.sourceParameterIndex,
    entry.parameterIndex, entry.sourceForm]), [[0, 0, 0, 0, "value"], [1, 1, 1, 1, "spread-sequence"], [2, 2, 1, 1, "value"]]);
  assert.equal(Object.isFrozen(grouping) && Object.isFrozen(grouping.arguments) && Object.isFrozen(grouping.groups), true);
  for (const [index, entry] of grouping.arguments.entries()) {
    assert.equal(Object.isFrozen(entry) && entry.type === input.types[index], true, `entry ${index}: exact immutable type`);
    assert.equal(entry.binding === input.source.arguments[index], true, `entry ${index}: Host binding identity`);
    assert.equal(entry.expression === input.source.arguments[index].argument, true, `entry ${index}: Host argument expression`);
  }
  assert.equal(grouping.groups.every(group => Object.isFrozen(group) && Object.isFrozen(group.arguments) && group.arguments.every(Object.isFrozen)), true);
});

for (const [name, input, groups] of [
  ["fixed", fixture(["value", "value"], [required, required]), [[0, false, [0]], [1, false, [1]]]],
  ["optional omitted direct", fixture(["value"], [required, optional]), [[0, false, [0]]]],
  ["optional omitted native arity", fixture(["value"], [required, optional], true), [[0, false, [0]], [1, false, []]]],
  ["direct rest values", fixture(["value", "value"], [rest]), [[0, false, [0]], [0, false, [1]]]],
  ["native rest values", fixture(["value", "value"], [rest], true), [[0, true, [0, 1]]]],
  ["one rest sequence", fixture(["spread-sequence"], [rest]), [[0, false, [0]]]],
  ["mixed rest", fixture(["value", "spread-sequence", "value"], [rest]), [[0, true, [0, 1, 2]]]],
  ["empty native rest", fixture([], [rest], true), [[0, true, []]]],
]) test(`source grouping seals complete output groups: ${name}`, () => {
  const grouping = select(input);
  assert.equal(grouping.kind, "grouped", name);
  assert.deepEqual(grouping.groups.map(group => [group.parameterIndex, group.collect, group.arguments.map(argument => argument.index)]), groups, name);
});

test("Host source parameters and native implementation parameters need not have equal indices", () => {
  const input = fixture(["value", "value", "value"], [rest]);
  input.parameters = [required, rest];
  const grouping = select(input);
  assert.equal(grouping.kind, "grouped");
  assert.deepEqual(grouping.arguments.map(entry => [entry.sourceParameterIndex, entry.parameterIndex]), [[0, 0], [0, 1], [0, 1]]);
});

for (const [name, mutate] of [
  ["wrong source index", input => alterBinding(input, 1, { argumentIndex: 2 })],
  ["duplicate effective index", input => alterBinding(input, 1, { effectiveIndex: 0 })],
  ["effective index gap", input => alterBinding(input, 1, { effectiveIndex: 2 })],
  ["wrong source parameter", input => alterBinding(input, 1, { parameterIndex: 0 })],
  ["wrong source parameter form", input => alterBinding(input, 1, { mode: "rest-element" })],
  ["duplicate fixed source binding", input => alterBinding(input, 1, { argumentIndex: 0 })],
  ["reversed source bindings", input => ({ ...input, source: { ...input.source, arguments: input.source.arguments.map(binding =>
    ({ ...binding, argumentIndex: 1 - binding.argumentIndex })) } })],
  ["negative key", input => alterBinding(input, 1, { parameterIndex: -1 })],
  ["fractional key", input => alterBinding(input, 1, { effectiveIndex: 0.5 })],
  ["incomplete type vector", input => ({ ...input, types: [scalar] })],
  ["invalid native rest position", input => ({ ...input, parameters: [rest, required] })],
]) test(`inconsistent source grouping has no usable prefix: ${name}`, () => {
  const grouping = select(mutate(fixture(["value", "value"], [required, required])));
  assert.equal(grouping.kind, "inconsistent", name);
  assert.equal("arguments" in grouping || "groups" in grouping, false, `${name}: no prefix`);
  assert.equal(Object.isFrozen(grouping) && typeof grouping.reason === "string", true, name);
});

test("unsupported tuple expansion is refused as a complete outcome, not a grouped prefix", () => {
  const input = fixture(["value", "spread-element"], [required, required]);
  input.source.arguments[1].spreadElement = 0;
  const grouping = select(input);
  assert.equal(grouping.kind, "refused");
  assert.equal("arguments" in grouping || "groups" in grouping, false);
  assert.equal(Object.isFrozen(grouping) && grouping.reason.length > 0, true);
});

test("unresolved source grouping remains distinct from refusal and contradiction", () => {
  const input = fixture(["value", "value"], [required, required]);
  for (const [name, changed] of [
    ["native parameters", { ...input, parameters: undefined }],
    ["binding types", { ...input, types: undefined }],
    ["one binding type", { ...input, types: [scalar, undefined] }],
  ]) {
    const grouping = select(changed);
    assert.equal(grouping.kind, "unresolved", name);
    assert.equal("arguments" in grouping || "groups" in grouping, false, name);
  }
  assert.equal(select(input).kind, "grouped", "final evidence admits all arguments");
});

test("missing final argument types do not erase the distinction between pending and inconsistent bindings", () => {
  const input = fixture(["value", "value"], [required, required]);
  assert.equal(select({ ...input, types: [scalar, undefined] }).kind, "unresolved");
  assert.equal(select(alterBinding(input, 1, { parameterIndex: 0 })).kind, "inconsistent");
});

test("grouping builds exact indices once instead of repeated source/effective lookups", () => {
  for (const count of [64, 1024]) {
    const input = fixture(Array(count).fill("value"), Array(count).fill(required));
    let reads = 0;
    for (const binding of input.source.arguments) {
      const sourceIndex = binding.argumentIndex;
      Object.defineProperty(binding, "argumentIndex", { get() { reads += 1; return sourceIndex; } });
    }
    for (const values of [input.source.arguments, input.source.parameters]) {
      for (const method of ["find", "findIndex", "filter", "indexOf"]) Object.defineProperty(values, method, {
        value() { throw new Error(`unexpected ${method} scan of source call inputs`); },
      });
    }
    const grouping = select(input);
    assert.equal(grouping.kind === "grouped" && grouping.arguments.length === count && grouping.groups.length === count, true,
      `${count}: every actual argument is admitted`);
    assert.equal(reads > 0 && reads <= count * 12, true, `${count}: source-index reads remain linear (${reads})`);
  }
});
