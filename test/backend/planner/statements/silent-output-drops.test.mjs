import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planThrowStatement } from "../../../../dist/backend/planner/statements/statement-simple.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { createTsonicPlugin } from "../../../../../csharp-nodejs/dist/index.js";

const throwMessage = "Throw statements require C# type syntax for the sealed thrown carrier 'target:example.Unrendered<>' before C# emission.";

test("a sealed thrown carrier without C# type syntax is reported, never emitted as a dropped throw", () => {
  const compiled = compileCsharpSource({ sourceText: "export function fail(error: Error): void { throw error; }" });
  const program = compiled.result.program;
  assert.equal(program !== undefined && compiled.result.diagnostics.length === 0, true, "the authored throw compiles");
  const ast = program.source.ast;
  const declaration = program.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => ast.text(ast.name(node)) === "fail");
  const statement = ast.statements(ast.body(declaration))[0];
  const expression = ast.as.AsThrowStatement(statement).Expression;
  const classification = program.records.throwValue.get(statement);
  assert.equal(classification !== undefined && classification.targetCarrier !== undefined, true,
    "analysis seals the thrown carrier");
  const context = createCsharpPlanningContext(program);
  const unrendered = csharpTargetNamedType("example.Unrendered", undefined, undefined, { allowsRefLikeTypeArguments: [],});
  const changed = { ...program, records: { ...program.records,
    throwValue: { get: node => node === statement ? { ...classification, targetCarrier: unrendered } : undefined } } };
  const diagnostics = [];
  const planned = planThrowStatement(statement, ast.getSourceFile(statement), { ...context, program: changed }, diagnostics);
  assert.equal(planned.length === 0, true, "no throw statement is emitted for a carrier without C# type syntax");
  assert.equal(diagnostics.length === 1, true, "exactly one diagnostic reports the refused throw");
  assert.equal(diagnostics[0]?.code === "CSHARP_UNSUPPORTED_AST" && diagnostics[0]?.category === "error", true,
    "the refusal is an unsupported-construct error");
  assert.equal(diagnostics[0]?.message === throwMessage, true, "the refusal names the missing thrown carrier syntax");
  assert.equal(diagnostics[0]?.sourceNode === expression, true, "the refusal points at the thrown expression");
});

const headerSource = `
import type { IncomingMessage } from "node:http";
type NativeHeaders = IncomingMessage["headersDistinct"];
export function joinFromHeaders(headers: NativeHeaders, key: string): string {
  const values = headers[key];
  if (values === undefined) return "";
  let result = "";
  for (const value of values) result += value;
  return result;
}
`;

for (const surface of [undefined, "js"]) {
  test(`a native indexed for-of over provider header values emits its indexed loop (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, capabilities: [createTsonicPlugin()], sourceText: headerSource });
    const codes = compiled.result.diagnostics.map(diagnostic => diagnostic.code);
    assert.equal(codes.length === 0, true, `the header loop compiles without diagnostics: ${codes.join(",")}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/for \(int __tsonic_[a-z0-9_]+ = 0; __tsonic_[a-z0-9_]+ < __tsonic_[a-z0-9_]+\.Count; __tsonic_[a-z0-9_]+\+\+\)/u.test(output), true,
      "the loop iterates the native Count length");
    assert.equal(/HeaderValues\.read\(/u.test(output), true, "each element is read through the provider's static read member");
    assert.equal(/\bforeach\b/u.test(output), false, "no enumerator loop replaces the native indexed read");
  });
}
