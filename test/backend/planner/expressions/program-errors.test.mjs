import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planThrowStatement } from "../../../../dist/backend/planner/statements/statement-simple.js";
import { admitCsharpStatementBindings } from "../../../../dist/analysis/control-flow/native-control-flow.js";
import { csharpStringTargetType } from "../../../../dist/target-model/types/index.js";

test("native throw planning requires its exact sealed operand, source carrier and target conversion", () => {
  const compiled = compileCsharpSource({ sourceText: "export function fail(error: Error): void { throw error; }" });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assertCsharpCompilationSucceeded(compiled);
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  const program = compiled.result.program;
  const source = program.source;
  const declaration = program.sourceFiles.flatMap(file => source.ast.statements(file))
    .find(node => source.ast.text(source.ast.name(node)) === "fail");
  const statement = source.ast.statements(source.ast.body(declaration))[0];
  const classification = program.records.throwValue.get(statement);
  assert.ok(classification && classification.targetCarrier);
  const context = createCsharpPlanningContext(program);
  const diagnostics = [];
  assert.equal(planThrowStatement(statement, source.ast.getSourceFile(statement), context, diagnostics).length, 1);
  assertNoTargetDiagnostics(diagnostics);
  for (const selected of [undefined, { ...classification, expression: declaration },
    { ...classification, sourceCarrier: csharpStringTargetType() }]) {
    const changed = { ...program, records: { ...program.records, throwValue: { get: () => selected } } };
    const issues = admitCsharpStatementBindings(source.ast, [statement], program.records.nativeUse,
      changed.records, program.records, program.records.generator, program.records.nativeParticipation,
      program.records.compileTimeMetadata, program.records.valueRead);
    assert.equal(issues.length, 1, "one pre-seal owner rejects each original invalid throw classification");
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the original source refusal code is retained");
    assert.equal(issues[0].sourceNode === classification.expression, true, "the exact original operand owns the refusal");
    assert.equal(issues[0].message, "Throw expression has no exact sealed C# native error carrier classification.");
  }
  const missing = { ...program, records: { ...program.records, throwValue: { get: () => undefined } } };
  const missingDiagnostics = [];
  assert.throws(() => planThrowStatement(statement, source.ast.getSourceFile(statement),
    { ...context, program: missing }, missingDiagnostics),
  error => error.message.includes("An admitted throw lost its selected native error carrier."),
  "only bypassing successful admission reaches the separate missing-record invariant");
  assert.equal(missingDiagnostics.length, 0, "corrupted published evidence never repeats a source refusal");
  const native = program.records.nativeUse.expression(classification.expression);
  assert.equal(native !== undefined && native.use.kind !== "erased", true, "the actual throw operand has one admitted native use");
  const invalidTarget = csharpStringTargetType();
  const invalidUse = { ...native.use, kind: "converted", input: native.use.completion,
    target: invalidTarget, mode: "implicit", completion: { kind: "value", type: invalidTarget } };
  const changed = { ...program, records: { ...program.records,
    throwValue: { get: () => ({ ...classification, targetCarrier: invalidTarget }) },
    nativeUse: { ...program.records.nativeUse,
      expression: node => node === classification.expression ? { site: native.site, use: invalidUse }
        : program.records.nativeUse.expression(node),
      get: site => site === native.site ? invalidUse : program.records.nativeUse.get(site),
    } } };
  const invalid = [];
  assert.deepEqual(planThrowStatement(statement, source.ast.getSourceFile(statement), { ...context, program: changed }, invalid), []);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].message, "C# planning requires a sealed implicit expression conversion from 'target:System.Exception<>' to 'target:System.String<>'.");
});
