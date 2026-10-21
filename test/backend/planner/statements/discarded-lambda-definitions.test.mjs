import assert from "node:assert/strict";
import test from "node:test";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { planCsharpPlannedDiscard, planCsharpDiscardedStatement, planDiscardedExpression } from "../../../../dist/backend/planner/statements/statement-output.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const invocation = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "effect" }, arguments: [] };
const prelude = { kind: "ExpressionStatement", expression: invocation };

for (const asynchronous of [false, true]) for (const explicit of [false, true]) {
  test(`discarded ${asynchronous ? "async" : "sync"} source definitions are erased before planning (${explicit})`, () => {
    const compiled = compileCsharpSource({ sourceText: `
      export function effect(): number { return 1; }
      export function run(): void { effect(); ${explicit ? "void " : ""}(((${asynchronous ? "async " : ""}() => effect()))); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const ast = compiled.source.ast;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    visit(compiled.source.getSourceFile("/project/index.ts"));
    const definition = nodes.find(node => ast.is.IsArrowFunction(node));
    assert.equal(definition !== undefined, true, "the checked source definition is retained for admission");
    assert.equal(compiled.result.program.records.lambdaCreation.get(definition).kind, "discarded",
      "one pre-seal source-use owner erases only the uninvoked definition");
    const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal([...generated.matchAll(/\beffect\s*\(/gu)].length, 2,
      "the declaration and one prior effect remain; the uninvoked body is not emitted or executed");
  });
}

test("discarding calls and getter reads must still evaluate their effects", () => {
  const getter = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "source" }, name: "callback" };
  const delegate = csharpDelegateTargetType("System.Func", [], integer);
  for (const [expression, carrier] of [[invocation, integer], [getter, delegate], [invocation, csharpTaskTargetType(integer)]]) {
    const statements = planCsharpPlannedDiscard(csharpPlannedValue(carrier, expression, [prelude]));
    assert.equal(statements.length === 2 && statements[0] === prelude, true, "effects retain their evaluation order");
    const selected = statements[1].expression;
    assert.equal(selected === expression || selected.kind === "AssignmentExpression" && selected.right === expression, true, "native evaluation is not erased");
  }
});
