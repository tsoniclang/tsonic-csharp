import assert from "node:assert/strict";
import test from "node:test";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import * as expressionEntry from "../../../../dist/backend/planner/expressions/index.js";
import { createCsharpExpectedUseCollection } from "../../../../dist/analysis/expected-types/collection.js";
import { createCsharpExpectedTypePropagation } from "../../../../dist/analysis/expected-types/propagation.js";
import { admitCsharpExpectedBinarySelection } from "../../../../dist/policy/operations/operators/expected-binary.js";
import { planCsharpNativeExpression } from "../../../../dist/backend/planner/expressions/expression-expected-types.js";
import { selectCsharpNativeUseRepresentation } from "../../../../dist/policy/conversions/native-use-representation.js";
import { csharpNativeUseSite } from "../../../../dist/target-model/records/native-demand.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const binary = { case: "binary" };
const other = { case: "other" };
const left = { case: "left" };
const right = { case: "right" };

function selection(resultType, inputType = int32) {
  return { kind: "resolved", sourceOperator: "+", targetOperation: { kind: "operator", operator: "+" },
    left, right, leftType: inputType, rightType: inputType, leftInputType: inputType, rightInputType: inputType, resultType };
}

function context({ baseline, eligible, contextual }) {
  const reads = [];
  const operands = [];
  const ast = { kindName: node => node === binary ? "KindBinaryExpression" : "KindIdentifier",
    isConstAssertion: () => false,
    is: { IsBinaryExpression: node => node === binary, IsArrayLiteralExpression: () => false,
      IsObjectLiteralExpression: () => false, IsParenthesizedExpression: () => false,
      IsSatisfiesExpression: () => false, IsConditionalExpression: () => false } };
  const operations = {
    binaryOperation: { get: node => node === binary && baseline !== undefined ? { target: baseline } : undefined },
    operatorForm: { get: node => node === binary ? "selected" : undefined,
      usesExpectedResultType: node => node === binary ? eligible : undefined },
  };
  const propagation = createCsharpExpectedTypePropagation({ policy: { ast }, operations },
    { record: (node, target) => operands.push({ node, target }) }, (node, target) => {
      reads.push({ node, target });
      if (contextual === "untouched") assert.fail("the contextual selection must not be read");
      return admitCsharpExpectedBinarySelection(target, contextual, baseline);
    });
  return { ast, reads, operands, propagation };
}

function propagate(current, node, target) {
  if (target !== undefined) current.propagation.propagate({ expression: node, targetType: target, strength: "required", exactInteger: false });
}

test("a non-binary node or an absent native target creates no contextual binary operation", () => {
  assert.equal(Object.hasOwn(expressionEntry, "planExpressionWithExpectedType"), false, "the hint-based entry is removed");
  for (const [label, node, target] of [["non-binary node", other, int32], ["absent target", binary, undefined]]) {
    const current = context({ baseline: selection(int32), eligible: true, contextual: "untouched" });
    const collection = createCsharpExpectedUseCollection({ ast: current.ast });
    collection.record(node, target, "required");
    for (let pending = collection.takePending(); pending !== undefined; pending = collection.takePending()) {
      current.propagation.propagate(pending);
    }
    assert.equal(current.reads.length === 0 && current.operands.length === 0, true, `${label}: no contextual lookup or operand plan`);
  }
});

test("a resolved baseline without stored eligibility never reads the contextual selection", () => {
  for (const eligible of [false, undefined]) {
    const baseline = selection(int32);
    const current = context({ baseline, eligible, contextual: "untouched" });
    propagate(current, binary, int32);
    assert.equal(current.reads.length, 0, `eligibility ${eligible}: the private contextual selector is untouched`);
    assert.equal(current.operands.length === 2 && current.operands[0].target === baseline.leftInputType &&
      current.operands[1].target === baseline.rightInputType, true, `eligibility ${eligible}: only the actual baseline supplies operands`);
  }
});

test("an absent or rejected baseline cannot publish operands or silently plan without sealed evidence", () => {
  for (const [label, baseline] of [["absent baseline", undefined], ["rejected baseline", { kind: "rejected", reason: "baseline refused" }]]) {
    for (const eligible of [false, true]) {
      const current = context({ baseline, eligible, contextual: undefined });
      propagate(current, binary, int32);
      assert.equal(current.operands.length, 0, `${label}, eligibility ${eligible}: no invented operand demand`);
      assert.equal(current.reads.length, eligible ? 1 : 0, `${label}, eligibility ${eligible}: only an eligible operation asks for context`);
      assert.throws(() => planCsharpNativeExpression(binary, {}, { program: { records: { nativeExpression: { get: () => undefined } } } }, [],
        { planExpression: () => assert.fail("no operand plan"), planSourceExpression: () => assert.fail("no source fallback") }),
      /exact pre-seal native emission context/u, `${label}: an impossible missing record is an invariant, not a second source rejection`);
    }
  }
});

test("a contextual selection with stored false eligibility is not admitted instead of the baseline", () => {
  const current = context({ baseline: undefined, eligible: false, contextual: selection(int32) });
  propagate(current, binary, int32);
  assert.equal(current.reads.length === 0 && current.operands.length === 0, true, "false eligibility cannot activate a contextual selection");
});

test("an eligible contextual binary result differing from the target never replaces the baseline", () => {
  const selected = selection(float64);
  const children = [
    { site: csharpNativeUseSite(binary, { kind: "operand", position: "left" }, { target: int32 }), expression: left, target: int32 },
    { site: csharpNativeUseSite(binary, { kind: "operand", position: "right" }, { target: int32 }), expression: right, target: int32 },
  ];
  const current = context({ baseline: undefined, eligible: true, contextual: selected });
  propagate(current, binary, int32);
  assert.equal(current.reads.length === 1 && current.reads[0].node === binary && current.reads[0].target === int32, true,
    "the owning analysis makes exactly one contextual selection");
  assert.equal(current.operands.length, 0, "the absent baseline is not replaced with a mismatching contextual result");
  const baseline = selection(int32);
  assert.equal(admitCsharpExpectedBinarySelection(int32, selected, baseline) === baseline, true,
    "a present baseline remains authoritative when the eligible contextual result differs");
  assert.equal(admitCsharpExpectedBinarySelection(int32, selected, undefined) === undefined, true,
    "a mismatching contextual result cannot invent a missing baseline");
  const represented = selectCsharpNativeUseRepresentation({ ast: current.ast, expression: binary, target: int32,
    source: float64, mode: "implicit", absent: false, literal: { kind: "not-applicable" }, binary: selected,
    callable: undefined, children: new Map(children.map(entry => [targetUseSiteIdentity(entry.site), entry])) });
  assert.equal(represented.kind === "selected" && represented.representation === "convert" && represented.carrier === float64, true,
    "the result is not relabelled as the destination carrier");
});

test("the one sealed native binary plans its operands in order with their selected carriers and no hints", () => {
  const selected = selection(int32);
  const current = context({ baseline: selection(float64), eligible: true, contextual: selected });
  propagate(current, binary, int32);
  const native = { kind: "constructed", expression: binary, carrier: int32,
    completion: { kind: "value", type: int32 }, children: [], evaluation: { kind: "sequence", steps: [] }, binary: selected };
  // The analysis's native binary emission for a plain int32 '+': binary syntax, no location, no suspension.
  const emission = { selection: selected, syntax: "binary", storage: left, location: undefined, rightSuspends: false,
    narrowedCoalescing: false, nativeBoolean: false, retainOther: true };
  const records = { nativeExpression: { get: node => node === binary ? { use: native, physical: native, conversion: undefined } : undefined },
    nativeBinaryEmission: { get: (node, selection) => node === binary && selection === selected ? emission : undefined },
    int32Remainder: { get: () => false },
    typeEmission: csharpTypeEmissionRecord(),
    expectedBinary: { get: () => assert.fail("the planner cannot reselect") } };
  const input = { scope: {}, program: { source: { ast: current.ast }, records } };
  const diagnostics = [];
  const operands = [];
  const planned = planCsharpNativeExpression(binary, {}, input, diagnostics, {
    planSourceExpression: () => assert.fail("the baseline renderer is not a fallback"),
    planExpression: (...arguments_) => {
      const [operand] = arguments_;
      const target = operand === left ? selected.leftInputType : selected.rightInputType;
      operands.push({ operand, target, arguments_: arguments_.length });
      return csharpPlannedValue(target, { kind: "IdentifierName", name: operand === left ? "first" : "second" });
    },
  });
  assert.equal(current.reads.length === 1 && diagnostics.length === 0, true, "one analysis selection and no renderer diagnostics");
  assert.equal(operands.length === 2 && operands[0].operand === left && operands[1].operand === right, true, "left plans before right");
  assert.equal(operands[0].target === selected.leftInputType && operands[1].target === selected.rightInputType, true, "exact selected native inputs");
  assert.equal(operands.every(entry => entry.arguments_ <= 5), true, "the canonical renderer receives no expected-type hints");
  assert.equal(planned !== undefined && planned.completion.kind === "value" && planned.completion.carrier === int32, true, "the exact result carrier");
  assert.equal(planned.prelude.length, 0, "the native operation needs no prelude");
  assert.equal(printCsharpExpression(planned.completion.expression), "first + second", "the selected native operation is emitted");
});
