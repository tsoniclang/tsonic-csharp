import assert from "node:assert/strict";
import test from "node:test";
import { csharpSelectedTargetArgumentBindings, csharpSourceOwnedArgumentBindings } from "../../../dist/policy/operations/members/selection/native-use-arguments.js";
import { selectCsharpSourceArgumentGrouping } from "../../../dist/policy/operations/members/selection/source-argument-groups.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "int32" });
const array = Object.freeze({ kind: "array", element: scalar });
const targetArgument = (sourceArgumentIndex, effectiveArgumentIndex, targetParameterIndex, sourceForm = "value") =>
  Object.freeze({ sourceArgumentIndex, effectiveArgumentIndex, targetParameterIndex, sourceForm });

test("selected target bindings retain tuple expansion, mapped parameters and each distinct effective use", () => {
  const selected = csharpSelectedTargetArgumentBindings({ arguments: [
    targetArgument(0, 0, 2), targetArgument(1, 1, 0, "spread-element"), targetArgument(1, 2, 1, "spread-element") ] });
  assert.equal(selected.kind, "bound");
  assert.deepEqual(selected.bindings.map(entry => [entry.sourceArgumentIndex, entry.slot.effectiveIndex, entry.slot.parameterIndex, entry.sequence]),
    [[0, 0, 2, false], [1, 1, 0, false], [1, 2, 1, false]]);
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.bindings) &&
    selected.bindings.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.slot)), true);
});

test("sequence bindings retain one operand without overlooking a contradictory later element or missing tail", () => {
  const sequenceArguments = [{ sourceArgumentIndex: 0, targetParameterIndex: 1 }];
  const selected = csharpSelectedTargetArgumentBindings({ sequenceArguments,
    arguments: [targetArgument(0, 0, 1, "spread-element"), targetArgument(0, 1, 1, "spread-element")] });
  assert.equal(selected.kind === "bound" && selected.bindings.length === 1 && selected.bindings[0].sequence &&
    selected.bindings[0].slot.effectiveIndex === 0, true);
  for (const [name, call] of [
    ["contradictory later element", { sequenceArguments, arguments: [targetArgument(0, 0, 1), targetArgument(0, 1, 2)] }],
    ["duplicate effective", { arguments: [targetArgument(0, 0, 1), targetArgument(1, 0, 2)] }],
    ["missing sequence binding", { sequenceArguments, arguments: [] }],
    ["duplicate sequence", { sequenceArguments: [...sequenceArguments, ...sequenceArguments], arguments: [targetArgument(0, 0, 1)] }],
  ]) {
    const result = csharpSelectedTargetArgumentBindings(call);
    assert.equal(result.kind === "inconsistent" && !Object.hasOwn(result, "bindings") && Object.isFrozen(result), true, name);
  }
});

function sourceInput() {
  const expressions = [{ label: "head" }, { label: "tail" }];
  const bindings = [0, 1].map(index => ({ sourceArgumentIndex: index, effectiveArgumentIndex: index,
    sourceParameterIndex: index, sourceParameterForm: "parameter", sourceForm: "value" }));
  return { source: { sourceSelectedSignatureKind: "resolved", sourceArguments: expressions.map(expression => ({ expression })),
    sourceSelectedSignatureParameters: [0, 1].map(parameterIndex => ({ parameterIndex, rest: false })), sourceArgumentBindings: bindings },
  parameters: [0, 1].map(index => ({ name: `arg${index}`, type: scalar, passingMode: "by-value" })),
  types: [scalar, scalar], slots: [0, 1].map(sourceParameterIndex => ({ sourceParameterIndex, form: "required" })) };
}

test("source use projection consumes the actual U4 grouping with no second binding or positional fallback", () => {
  const input = sourceInput();
  const grouping = selectCsharpSourceArgumentGrouping(input.source, input.parameters, input.types, input.slots);
  const selected = csharpSourceOwnedArgumentBindings(grouping);
  assert.equal(selected.kind, "bound");
  assert.deepEqual(selected.bindings.map(entry => entry.slot), [0, 1].map(index => ({ kind: "argument", sourceIndex: index,
    effectiveIndex: index, parameterIndex: index, sourceParameterIndex: index })));
  for (const [name, parameters, types] of [["missing type", input.parameters, [scalar, undefined]],
    ["native arity refusal", input.parameters.slice(0, 1), input.types]]) {
    const refused = selectCsharpSourceArgumentGrouping(input.source, parameters, types, input.slots);
    const view = csharpSourceOwnedArgumentBindings(refused);
    assert.equal(view === refused && !Object.hasOwn(view, "bindings"), true, `${name}: original complete outcome retained`);
  }
  const invalidSource = { ...input.source, sourceArgumentBindings: input.source.sourceArgumentBindings.slice(0, 1) };
  const inconsistent = selectCsharpSourceArgumentGrouping(invalidSource, input.parameters, [scalar], input.slots);
  assert.equal(csharpSourceOwnedArgumentBindings(inconsistent) === inconsistent && inconsistent.kind === "inconsistent", true);
  assert.equal(csharpSourceOwnedArgumentBindings(undefined).kind, "unresolved");
});

test("a source rest sequence is projected from its admitted sourceForm rather than an invented spread field", () => {
  const grouping = Object.freeze({ kind: "grouped", groups: Object.freeze([]), arguments: Object.freeze([
    Object.freeze({ sourceArgumentIndex: 2, effectiveArgumentIndex: 4, sourceParameterIndex: 0, parameterIndex: 1,
      sourceForm: "spread-sequence", type: array }),
  ]) });
  const selected = csharpSourceOwnedArgumentBindings(grouping);
  assert.equal(selected.kind === "bound" && selected.bindings[0].sequence && selected.bindings[0].slot.sourceParameterIndex === 0 &&
    selected.bindings[0].slot.parameterIndex === 1, true);
});
