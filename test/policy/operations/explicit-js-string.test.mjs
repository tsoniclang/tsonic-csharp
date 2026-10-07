import assert from "node:assert/strict";
import test from "node:test";
import { sourceMarkerFactKey } from "@tsonic/tsts";
import { selectCsharpJsStringConversion } from "../../../dist/policy/operations/strings/explicit-js-string.js";
import { tryPlanCsharpJsStringConversion } from "../../../dist/backend/planner/expressions/expression-js-string-conversion.js";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../dist/backend/planner/expressions/planned-values.js";
import { csharpJsStringTargetType, csharpStringTargetType, csharpNeverTargetType, csharpVoidTargetType } from "../../../dist/policy/types/index.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/selection/core.js";

const nativeString = csharpStringTargetType();
const exactString = csharpJsStringTargetType();

function fixture(options = {}) {
  const node = {};
  const sourceValue = {};
  const sourceFile = {};
  const marker = options.marker === undefined && !options.missingFact
    ? { kind: "call-marker", marker: "js-string" } : options.marker;
  const policy = {
    sourceFacts: { getFact: (subject, key) => subject === node && key === sourceMarkerFactKey ? marker : undefined },
    ast: {
      is: {
        IsCallExpression: subject => subject === node && !options.notCall,
        IsSpreadElement: () => options.spread === true,
      },
      arguments: () => options.arguments ?? [sourceValue],
    },
    types: { resolveNode: subject => subject === sourceValue ? options.sourceType ?? nativeString
      : subject === node ? options.resultType ?? exactString : undefined },
  };
  return { node, sourceValue, sourceFile, selection: selectCsharpJsStringConversion(policy, node, sourceFile) };
}

test("explicit C# JsString selection seals its exact semantic output carrier", () => {
  const selected = fixture();
  assert.equal(selected.selection.kind, "resolved");
  assert.equal(selected.selection.sourceValue === selected.sourceValue, true);
  assert.equal(selected.selection.resultType === exactString, true);
  assert.equal(Object.isFrozen(selected.selection), true);
  for (const options of [
    { missingFact: true },
    { marker: { kind: "call-marker", marker: "unrelated" } },
    { marker: { kind: "type-marker", marker: "js-string" } },
  ]) assert.equal(fixture(options).selection.kind, "not-js-string-conversion");
});

test("explicit C# JsString selection rejects malformed syntax and wrong carrier evidence", () => {
  for (const options of [
    { notCall: true },
    { spread: true },
    { arguments: [] },
    { arguments: [{}, {}] },
    { sourceType: exactString },
    { sourceType: { kind: "source-primitive", name: "int32" } },
    { resultType: nativeString },
    { resultType: { kind: "target-named", id: "Foreign.JsString" } },
  ]) assert.equal(fixture(options).selection.kind, "rejected");
});

test("explicit C# JsString planning transports the native expression and prelude without runtime conversion", () => {
  const selected = fixture();
  const expression = { kind: "IdentifierName", name: "nativeText" };
  const effect = { kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    expression: { kind: "IdentifierName", name: "observe" }, arguments: [] } };
  const source = csharpPlannedValue(nativeString, expression, [effect]);
  const input = { program: { operations: { jsStringConversion: () => selected.selection } } };
  const diagnostics = [];
  let calls = 0;
  const result = tryPlanCsharpJsStringConversion(selected.node, selected.sourceFile, input, diagnostics,
    node => { calls++; assert.equal(node === selected.sourceValue, true); return source; });
  assert.equal(result.handled, true);
  assert.equal(result.expression.completion.carrier === exactString, true);
  assert.equal(result.expression.completion.expression === expression, true);
  assert.equal(result.expression.prelude.length, 1);
  assert.equal(result.expression.prelude[0] === effect, true);
  assert.equal(source.completion.carrier === nativeString, true);
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, []);
});

test("explicit C# JsString planning preserves never completion and rejects missing value completion", () => {
  const selected = fixture();
  const input = { program: { operations: { jsStringConversion: () => selected.selection } } };
  const thrown = { kind: "ThrowStatement", expression: { kind: "IdentifierName", name: "failure" } };
  const never = csharpPlannedEffect(csharpNeverTargetType(), [thrown]);
  const result = tryPlanCsharpJsStringConversion(selected.node, selected.sourceFile, input, [], () => never);
  assert.equal(result.expression === never, true);
  for (const source of [undefined, csharpPlannedEffect(csharpVoidTargetType(), [])]) {
    const missing = tryPlanCsharpJsStringConversion(selected.node, selected.sourceFile, input, [], () => source);
    assert.equal(missing.handled, true);
    assert.equal(missing.expression === undefined, true);
  }
  const unowned = tryPlanCsharpJsStringConversion(selected.node, selected.sourceFile,
    { program: { operations: { jsStringConversion: () => undefined } } }, [], () => assert.fail("Unowned marker cannot evaluate its argument."));
  assert.equal(unowned.handled, false);
});

test("ordinary native strings do not acquire explicit JsString identity through implicit conversion", () => {
  const context = { projectTypes: { typeFromTarget: () => undefined, directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => undefined } };
  assert.equal(selectCsharpConversion(context, nativeString, exactString, "implicit").kind, "rejected");
});
