import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceArgumentGrouping } from "../../../dist/policy/operations/members/selection/source-argument-groups.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const sequence = Object.freeze({ kind: "array", element: scalar });
const required = Object.freeze({ name: "value", type: scalar, passingMode: "by-value" });
const optional = Object.freeze({ ...required, optional: true });
const rest = Object.freeze({ name: "values", type: sequence, passingMode: "by-value", paramsArray: true });

function fixture(forms, parameters, exactArity = false) {
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const slots = parameters.map((parameter, index) => ({ sourceParameterIndex: index, sourceParameterName: `arg${index}`,
    form: parameter.paramsArray ? "rest" : parameter.optional ? "optional" : "required" }));
  const bindings = forms.map((sourceForm, index) => {
    const parameterIndex = restIndex < 0 ? index : Math.min(index, restIndex);
    return { sourceArgumentIndex: index, effectiveArgumentIndex: index, sourceForm, sourceParameterIndex: parameterIndex,
      sourceParameterForm: sourceForm === "spread-sequence" ? "rest-sequence" : parameterIndex === restIndex ? "rest-element" : "parameter" };
  });
  return { parameters, exactArity, slots, types: bindings.map(binding => binding.sourceForm === "spread-sequence" ? sequence : scalar),
    source: { sourceSelectedSignatureKind: "resolved", sourceArguments: forms.map((_, index) => ({ expression: { label: `argument${index}` } })),
      sourceSelectedSignatureParameters: parameters.map((parameter, index) => ({ parameterIndex: index, rest: parameter.paramsArray === true })),
      sourceArgumentBindings: bindings } };
}

function select(input) {
  return selectCsharpSourceArgumentGrouping(input.source, input.parameters, input.types, input.slots, input.exactArity);
}

function alterBinding(input, index, changed) {
  return { ...input, source: { ...input.source, sourceArgumentBindings: input.source.sourceArgumentBindings.map((binding, at) =>
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
    assert.equal(entry.binding === input.source.sourceArgumentBindings[index], true, `entry ${index}: checked binding identity`);
    assert.equal(entry.expression === input.source.sourceArguments[index].expression, true, `entry ${index}: checked source expression`);
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

test("checked source parameter slots and native implementation parameters need not have equal indices", () => {
  const input = fixture(["value", "value", "value"], [rest]);
  input.parameters = [required, rest];
  const grouping = select(input);
  assert.equal(grouping.kind, "grouped");
  assert.deepEqual(grouping.arguments.map(entry => [entry.sourceParameterIndex, entry.parameterIndex]), [[0, 0], [0, 1], [0, 1]]);
});

for (const [name, mutate] of [
  ["wrong source index", input => alterBinding(input, 1, { sourceArgumentIndex: 2 })],
  ["missing source binding", input => ({ ...input, source: { ...input.source, sourceArgumentBindings: input.source.sourceArgumentBindings.slice(0, 1) }, types: input.types.slice(0, 1) })],
  ["duplicate effective index", input => alterBinding(input, 1, { effectiveArgumentIndex: 0 })],
  ["effective index gap", input => alterBinding(input, 1, { effectiveArgumentIndex: 2 })],
  ["wrong source parameter", input => alterBinding(input, 1, { sourceParameterIndex: 0 })],
  ["wrong source parameter form", input => alterBinding(input, 1, { sourceParameterForm: "rest-element" })],
  ["duplicate fixed source binding", input => alterBinding(input, 1, { sourceArgumentIndex: 0 })],
  ["reversed source bindings", input => ({ ...input, source: { ...input.source, sourceArgumentBindings: input.source.sourceArgumentBindings.map(binding =>
    ({ ...binding, sourceArgumentIndex: 1 - binding.sourceArgumentIndex })) } })],
  ["negative key", input => alterBinding(input, 1, { sourceParameterIndex: -1 })],
  ["fractional key", input => alterBinding(input, 1, { effectiveArgumentIndex: 0.5 })],
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
  input.source.sourceArgumentBindings[1].spreadElementIndex = 0;
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
    ["checked slots", { ...input, slots: undefined }],
    ["untyped call", { ...input, source: { ...input.source, sourceSelectedSignatureKind: "untyped" } }],
  ]) {
    const grouping = select(changed);
    assert.equal(grouping.kind, "unresolved", name);
    assert.equal("arguments" in grouping || "groups" in grouping, false, name);
  }
  assert.equal(select(input).kind, "grouped", "final evidence admits all arguments");
});

test("grouping builds exact indices once instead of repeated source/effective lookups", () => {
  for (const count of [64, 1024]) {
    const input = fixture(Array(count).fill("value"), Array(count).fill(required));
    let reads = 0;
    for (const binding of input.source.sourceArgumentBindings) {
      const sourceIndex = binding.sourceArgumentIndex;
      Object.defineProperty(binding, "sourceArgumentIndex", { get() { reads += 1; return sourceIndex; } });
    }
    for (const values of [input.source.sourceArgumentBindings, input.source.sourceArguments]) {
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
