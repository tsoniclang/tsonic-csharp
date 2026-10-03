import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpJsValueLogical } from "../../../../dist/backend/planner/expressions/js-value-logical.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpTsValueTargetType } from "../../../../dist/target-model/types/index.js";
import { selectCsharpJsValueBinaryOperation, validateCsharpJsValueOperationSelection } from "../../../../dist/policy/js-value-operations/selection.js";

const carrier = csharpTsValueTargetType();
const identifier = name => ({ kind: "IdentifierName", name });
const effect = name => ({ kind: "ExpressionStatement", expression: { kind: "InvocationExpression", callee: identifier(name), arguments: [] } });
const nodes = value => value === null || typeof value !== "object" ? [] : [value, ...Object.values(value).flatMap(nodes)];

test("closed logical RHS statement regions execute only in their selected native branch", () => {
  const policy = { types: { resolveNode: () => carrier, resolveReadStorage: () => undefined } };
  for (const [operator, expectedBranch] of [["&&", "thenBody"], ["||", "elseBody"], ["??", "thenBody"]]) {
    let count = 0;
    const input = { program: { source: { ast: { pos: () => 1 } } }, scope: {},
      names: { temporaryName: () => `local${count++}` } };
    const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(policy, {}, {}, {}, operator));
    const diagnostics = [];
    const planned = planCsharpJsValueLogical({}, {}, input, diagnostics, selected, {}, {},
      csharpPlannedValue(carrier, identifier("left"), [effect("leftPrelude")]),
      csharpPlannedValue(carrier, identifier("right"), [effect("rightPrelude")]));
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(planned.prelude[0], effect("leftPrelude"));
    const branch = planned.prelude.find(statement => statement.kind === "IfStatement");
    assert.ok(branch);
    assert.equal(nodes(branch[expectedBranch]).some(node => node.name === "rightPrelude"), true);
    assert.equal(nodes(branch[expectedBranch === "thenBody" ? "elseBody" : "thenBody"]).some(node => node.name === "rightPrelude"), false);
    assert.equal(nodes(planned).some(node => node.kind === "LambdaExpression" || node.name === "ApplyDynamicLogical"), false);
    assert.equal(nodes(branch.condition).filter(node => node.kind === "IdentifierName" && node.name === "left").length, 1);
  }
});
