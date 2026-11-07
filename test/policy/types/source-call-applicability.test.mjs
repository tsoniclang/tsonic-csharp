// Call applicability over the Host call selection (nextgen C-2542 §2, R2, I4). The deleted resolution/call-contracts.ts
// and call-api.ts classified a callee's contract domain from checker call info. The Host now publishes the selected
// declaration, signature, receiver and result of every call (facts.selections.call); C# reads that record and
// represents its result. A foreign callee never replaces the Host-selected width, and a missing selection is never
// rebuilt by C#.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

function fixture(definition, invocation, external = true) {
  const files = external ? {
    "node_modules/@fixture/api/package.json": JSON.stringify({ name: "@fixture/api", version: "1.0.0", types: "index.d.ts" }),
    "node_modules/@fixture/api/index.d.ts": definition,
  } : {};
  const sourceText = external ? `import { invoke } from "@fixture/api"; export const result = ${invocation};`
    : `${definition} export const result = ${invocation};`;
  const program = hostProgram(sourceText, { files });
  const calls = program.nodes.filter(node => program.ast.is.IsCallExpression(node));
  assert.equal(calls.length, 1, "the fixture has one exact invocation");
  const selection = program.facts.selections.call(calls[0]);
  assert.equal(selection !== undefined && selection.kind !== "refused" && selection.use === calls[0], true,
    "the Host selects the identical invocation");
  return { program, call: calls[0], selection, at: representations(representationServices(program)) };
}

const float64 = csharpSourcePrimitiveTargetType("float64");

for (const [name, definition, invocation] of [
  ["function", "export declare function invoke(value: number): number;", "invoke(1)"],
  ["method", "export declare const invoke: { read(value: number): number };", "invoke.read(1)"],
]) test(`a foreign ${name} keeps the Host-selected result width`, () => {
  const current = fixture(definition, invocation);
  assert.equal(current.program.facts.navigation.identity.isProjectDeclaration(current.selection.signature), false,
    "the selected signature belongs to the foreign package");
  assert.equal(targetTypeRefEquals(represented(current.at.type(current.selection.result, current.call, "value")), float64), true,
    "a foreign callee classification never replaces the Host-selected float64 width");
  assert.equal(targetTypeRefEquals(represented(current.at.value(current.call)), float64), true,
    "the call value is the same Host answer");
  assert.equal(current.selection.arguments.length === 1 && current.selection.arguments[0].parameterIndex === 0 &&
    current.selection.arguments[0].mode === "positional", true, "argument correspondence is published, not rebuilt");
});

test("a foreign stored callable is selected through its function-type signature, not a declaration body", () => {
  const current = fixture("export declare const invoke: (value: number) => number;", "invoke(1)");
  const { ast } = current.program;
  assert.equal(ast.is.IsFunctionDeclaration(current.selection.signature), false,
    "a stored value call has no direct function declaration to borrow");
  assert.equal(current.selection.declaration === undefined || ast.is.IsVariableDeclaration(current.selection.declaration), true,
    "the called declaration is the stored value, if any");
  assert.equal(targetTypeRefEquals(represented(current.at.value(current.call)), float64), true);
});

test("an original project method keeps its receiver in the Host selection", () => {
  const current = fixture("declare const invoke: { read(value: number): number };", "invoke.read(1)", false);
  assert.notEqual(current.selection.receiver, undefined, "a project method call carries its exact receiver");
  assert.equal(current.program.ast.text(current.selection.receiver), "invoke");
  assert.equal(current.program.facts.navigation.identity.isProjectDeclaration(current.selection.signature), true,
    "a project declaration cannot claim the foreign domain");
});
