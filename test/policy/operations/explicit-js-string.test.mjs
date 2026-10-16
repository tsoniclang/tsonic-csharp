import assert from "node:assert/strict";
import test from "node:test";
import { sourceMarkerFactKey } from "@tsonic/tsts";
import { selectCsharpJsStringConversion } from "../../../dist/policy/operations/strings/explicit-js-string.js";
import { planCsharpJsStringConversion } from "../../../dist/backend/planner/expressions/expression-js-string-conversion.js";
import { selectCsharpNativeHandler } from "../../../dist/policy/operations/pointers/native-handlers.js";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../dist/backend/planner/expressions/planned-values.js";
import { csharpJsStringTargetType, csharpStringTargetType, csharpNeverTargetType, csharpVoidTargetType } from "../../../dist/policy/types/index.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";

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
    { resultType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Foreign.JsString" } },
  ]) assert.equal(fixture(options).selection.kind, "rejected");
});

test("explicit C# JsString planning transports the native expression and prelude without runtime conversion", () => {
  const selected = fixture();
  const expression = { kind: "IdentifierName", name: "nativeText" };
  const effect = { kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    expression: { kind: "IdentifierName", name: "observe" }, arguments: [] } };
  const source = csharpPlannedValue(nativeString, expression, [effect]);
  const input = { program: { records: {} } };
  const diagnostics = [];
  let calls = 0;
  const result = planCsharpJsStringConversion(selected.node, selected.selection, selected.sourceFile, input, diagnostics,
    node => { calls++; assert.equal(node === selected.sourceValue, true); return source; });
  assert.equal(result !== undefined, true);
  assert.equal(result.completion.carrier === exactString, true);
  assert.equal(result.completion.expression === expression, true);
  assert.equal(result.prelude.length, 1);
  assert.equal(result.prelude[0] === effect, true);
  assert.equal(source.completion.carrier === nativeString, true);
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, []);
});

test("explicit C# JsString planning preserves never completion and rejects missing value completion", () => {
  const selected = fixture();
  const input = { program: { records: {} } };
  const thrown = { kind: "ThrowStatement", expression: { kind: "IdentifierName", name: "failure" } };
  const never = csharpPlannedEffect(csharpNeverTargetType(), [thrown]);
  const result = planCsharpJsStringConversion(selected.node, selected.selection, selected.sourceFile, input, [], () => never);
  assert.equal(result === never, true);
  for (const source of [undefined, csharpPlannedEffect(csharpVoidTargetType(), [])]) {
    const missing = planCsharpJsStringConversion(selected.node, selected.selection, selected.sourceFile, input, [], () => source);
    assert.equal(missing === undefined, true);
  }
  const unowned = selectCsharpNativeHandler(undefined, undefined, undefined, undefined, undefined);
  assert.equal(unowned === undefined, true);
  if (unowned !== undefined) planCsharpJsStringConversion(selected.node, unowned.selection, selected.sourceFile, input, [],
    () => assert.fail("Unowned marker cannot evaluate its argument."));
});

test("ordinary native strings do not acquire explicit JsString identity through implicit conversion", () => {
  const context = { projectTypes: { typeFromTarget: () => undefined, directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => undefined } };
  assert.equal(selectCsharpConversion(context, nativeString, exactString, "implicit").kind, "rejected");
});
