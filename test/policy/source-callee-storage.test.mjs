import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpSourceCallee } from "../../dist/analysis/operations/source-callees.js";
import { csharpDelegateTargetType } from "../../dist/target-model/types/delegates.js";
import { csharpNullableTargetType } from "../../dist/target-model/types/nullable.js";

const expression = {};
const receiver = {};
const functionDeclaration = { kind: "function" };
const methodDeclaration = { kind: "method" };
const variableDeclaration = { kind: "variable" };
const delegate = csharpDelegateTargetType("System.Action", []);
const owner = { kind: "target-named", id: "owner", csharpRender: { kind: "name", namespace: [], name: "Owner" } };
function classify(declaration, selected, access, carrier = delegate) {
  return classifyCsharpSourceCallee({
    ast: { is: { IsFunctionDeclaration: node => node?.kind === "function", IsMethodDeclaration: node => node?.kind === "method" }, kindName: node => node.kind, hasModifierKind: () => false },
    navigation: { sourceReferenceFor: () => declaration === undefined ? undefined : { declaration } },
    types: { resolveReadStorage: () => carrier, resolveNode: () => carrier, resolveSelectedValue: () => owner },
  }, { sourceCallee: { expression, selectedDeclaration: selected }, sourceCalleeAccess: access }, {});
}

test("source direct functions do not become delegate operands", () => {
  const selected = classify(functionDeclaration, functionDeclaration);
  assert.equal(selected.kind, "function");
  assert.equal(selected.expression, expression);
  assert.equal(Object.isFrozen(selected), true);
});

test("function-selected alias storage remains a real callable value", () => {
  for (const declaration of [variableDeclaration, { kind: "parameter" }, { kind: "property" }]) {
    const selected = classify(declaration, functionDeclaration);
    assert.equal(selected.kind, "value");
    assert.equal(selected.type, delegate);
  }
});

test("direct methods supply receiver acquisition without delegate construction", () => {
  const selected = classify(methodDeclaration, methodDeclaration, { kind: "property", expression, receiver: { expression: receiver } });
  assert.equal(selected.kind, "method");
  assert.equal(selected.receiver.expression, receiver);
  assert.equal(selected.receiver.type, owner);
  assert.equal(Object.isFrozen(selected.receiver), true);
});

test("method-value protocols and optional delegates retain their physical storage", () => {
  const methodValue = { ...owner, csharpMethodValue: { owner, contract: delegate, method: "Invoke", identity: "method", typeParameters: [] } };
  assert.equal(classify(methodDeclaration, methodDeclaration, { kind: "property", receiver: { expression: receiver } }, methodValue).kind, "value");
  assert.equal(classify(variableDeclaration, functionDeclaration, undefined, csharpNullableTargetType(delegate)).kind, "value");
});

test("missing native callee storage evidence rejects without printed-name guessing", () => {
  assert.equal(classify(variableDeclaration, functionDeclaration, undefined, { kind: "source-primitive", name: "uint64" }).kind, "rejected");
  assert.equal(classify(undefined, undefined, undefined, { kind: "source-primitive", name: "uint64" }).kind, "rejected");
});
