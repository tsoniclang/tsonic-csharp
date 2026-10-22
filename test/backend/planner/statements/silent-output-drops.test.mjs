import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planThrowStatement } from "../../../../dist/backend/planner/statements/statement-simple.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { createTsonicPlugin } from "../../../../../csharp-nodejs/dist/index.js";
import { admitCsharpStatementBindings } from "../../../../dist/analysis/control-flow/native-control-flow.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

const throwMessage = "Throw statements require C# type syntax for the sealed thrown carrier 'target:example.Unrendered<>' before C# emission.";

for (const surface of ["native", "js"]) {
  test(`an unrepresentable public native throw is refused before publication on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { float16 } from "@tsonic/core/types.js";
      export function fail(value: float16): void { throw value; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the native half-precision argument has checked source types");
    assert.equal(compiled.targetDiagnostics.length, 1, "the single statement-admission owner refuses the unsupported error carrier");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_UNSUPPORTED_AST", "the original native throw refusal code is preserved");
    assert.equal(compiled.targetDiagnostics[0].message,
      "Throw statements require finalized TSTS/provider exception-carrier facts before C# emission. Resolved thrown expression carrier is not a target throwable carrier.",
      "the original native error-carrier refusal reason is preserved");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "the real admission aggregation rejects before native program and plan publication");
    assert.equal(compiled.artifacts.size, 0, "an unsupported native throw cannot emit partial artifacts");
  });
}

test("a thrown carrier without native syntax is refused at admission; corrupt published evidence is an invariant", () => {
  const compiled = compileCsharpSource({ sourceText: "export function fail(error: Error): void { throw error; }" });
  const program = compiled.result.program;
  assert.equal(program !== undefined && compiled.result.diagnostics.length === 0, true, "the authored throw compiles");
  const ast = program.source.ast;
  const declaration = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file))
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
  // The admission reads native demand's construct order (analysis-internal, not a published record) only as the gate
  // that the throw statement participates natively.
  const nativeUse = { ...program.records.nativeUse, order: node => node === statement ? [] : undefined };
  const issues = admitCsharpStatementBindings(ast, [statement], nativeUse,
    changed.records, program.records, program.records.generator, program.records.nativeParticipation,
    program.records.compileTimeMetadata, program.records.valueRead);
  assert.equal(issues.length, 1, "exactly one pre-seal diagnostic reports the refused throw");
  assert.equal(issues[0].code === "CSHARP_UNSUPPORTED_AST" && issues[0].category === "error", true,
    "the original unsupported-construct error is retained");
  assert.equal(issues[0].message, throwMessage, "the original missing carrier syntax reason is retained");
  assert.equal(issues[0].sourceNode === expression, true, "the same thrown expression owns the refusal");
  assert.match([...compiled.artifacts.values()].join("\n"), /throw error;/u,
    "the unchanged valid source still emits its native throw");
  const diagnostics = [];
  assert.throws(() => planThrowStatement(statement, ast.getSourceFile(statement),
    { ...context, program: changed }, diagnostics),
  error => error.message.includes("An admitted throw lost its selected native error type rendering."),
  "only deliberately corrupted published carrier evidence reaches the planner invariant");
  assert.equal(diagnostics.length, 0, "corrupted internal evidence never fabricates a second source refusal");
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
