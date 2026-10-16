import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCallForm } from "../../../dist/policy/operations/members/selection/call-forms.js";
import { selectCsharpSourceFlowCall } from "../../../dist/policy/operations/flow/source-flow.js";

const call = Object.freeze({ label: "call" });
const value = Object.freeze({ label: "value" });
const other = Object.freeze({ label: "other" });
const typeTest = Object.freeze({ label: "closed type test" });
const keepAlive = Object.freeze({ kind: "keep-alive", valueExpression: value });
const rejectedFlow = Object.freeze({ kind: "rejected", code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED", reason: "marker" });
const noFlow = Object.freeze({ kind: "not-source-flow" });
const resolvedJs = Object.freeze({ kind: "resolved", label: "JS value" });
const rejectedJs = Object.freeze({ kind: "rejected", reason: "JS value" });
const noJs = Object.freeze({ kind: "not-js-value" });

for (const [name, selected, inputs] of [
  ["type test over keep-alive and JS", "type-test", [typeTest, keepAlive, resolvedJs]],
  ["type test over both refusals", "type-test", [typeTest, rejectedFlow, rejectedJs]],
  ["type test alone", "type-test", [typeTest, noFlow, noJs]],
  ["keep-alive over resolved JS", "keep-alive", [undefined, keepAlive, resolvedJs]],
  ["keep-alive over rejected JS", "keep-alive", [undefined, keepAlive, rejectedJs]],
  ["keep-alive alone", "keep-alive", [undefined, keepAlive, noJs]],
  ["source refusal over resolved JS", "source-flow-rejected", [undefined, rejectedFlow, resolvedJs]],
  ["source refusal over rejected JS", "source-flow-rejected", [undefined, rejectedFlow, rejectedJs]],
  ["source refusal alone", "source-flow-rejected", [undefined, rejectedFlow, noJs]],
  ["resolved JS", "js-value", [undefined, noFlow, resolvedJs]],
  ["rejected JS", "js-value", [undefined, noFlow, rejectedJs]],
  ["target", "target", [undefined, noFlow, noJs]],
]) test(`call form preserves precedence: ${name}`, () => {
  const form = selectCsharpCallForm(...inputs);
  assert.equal(form.kind, selected, name);
  assert.equal(Object.isFrozen(form), true, `${name}: frozen descriptor`);
});

test("call forms carry only their selected descriptor and preserve source identity", () => {
  const typeForm = selectCsharpCallForm(typeTest, noFlow, noJs);
  assert.equal(Object.keys(typeForm).join(","), "kind,typeTest");
  assert.equal(typeForm.typeTest === typeTest, true, "selected type-test identity");
  const aliveForm = selectCsharpCallForm(undefined, keepAlive, noJs);
  assert.equal(Object.keys(aliveForm).join(","), "kind,sourceFlow");
  assert.equal(aliveForm.sourceFlow !== keepAlive && Object.isFrozen(aliveForm.sourceFlow), true, "frozen owned flow descriptor");
  assert.equal(aliveForm.sourceFlow.valueExpression === value, true, "original value expression identity");
  const refusedForm = selectCsharpCallForm(undefined, rejectedFlow, noJs);
  assert.equal(Object.keys(refusedForm).join(","), "kind,sourceFlow");
  assert.equal(refusedForm.sourceFlow !== rejectedFlow && Object.isFrozen(refusedForm.sourceFlow), true, "frozen owned rejection");
  assert.equal(refusedForm.sourceFlow.code === rejectedFlow.code && refusedForm.sourceFlow.reason === rejectedFlow.reason, true,
    "exact source refusal code and reason");
  for (const operation of [resolvedJs, rejectedJs]) {
    const form = selectCsharpCallForm(undefined, noFlow, operation);
    assert.equal(Object.keys(form).join(","), "kind,operation");
    assert.equal(form.operation === operation, true, "selected JS operation identity");
  }
  assert.equal(Object.keys(selectCsharpCallForm(undefined, noFlow, noJs)).join(","), "kind");
});

test("keep-alive evidence conflicts retain their own rejection, never a JS or target fallback", () => {
  for (const [name, fact, arguments_] of [
    ["wrong call", { call: other, valueExpression: value }, [value]],
    ["wrong value", { call, valueExpression: other }, [value]],
    ["extra argument", { call, valueExpression: value }, [value, other]],
  ]) {
    const sourceFlow = selectCsharpSourceFlowCall({ sourceFacts: { getFact: () => fact }, ast: { arguments: () => arguments_ } }, call);
    assert.equal(sourceFlow.kind === "rejected" && sourceFlow.code === "CSHARP_KEEP_ALIVE_EVIDENCE_CONFLICT", true, name);
    const form = selectCsharpCallForm(undefined, sourceFlow, resolvedJs);
    assert.equal(form.kind === "source-flow-rejected" && form.sourceFlow.code === "CSHARP_KEEP_ALIVE_EVIDENCE_CONFLICT", true, name);
    assert.equal(form.sourceFlow.reason, "Reachability requires the exact selected source call and value.", name);
  }
});
