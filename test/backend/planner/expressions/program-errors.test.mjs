import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planThrowStatement } from "../../../../dist/backend/planner/statements/statement-simple.js";
import { csharpStringTargetType } from "../../../../dist/target-model/types/index.js";

test("native throw planning requires its exact sealed operand, source carrier and target conversion", () => {
  const checked = checkCsharpSource({ sourceText: "export function fail(error: Error): void { throw error; }" });
  assert.equal(checked.sourceDiagnosticsText, "");
  assert.deepEqual(checked.extensionDiagnostics, []);
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assert.deepEqual(analysis.diagnostics, []);
  const program = analysis.value;
  const declaration = program.sourceFiles.flatMap(file => source.ast.statements(file))
    .find(node => source.ast.text(source.ast.name(node)) === "fail");
  const statement = source.ast.statements(source.ast.body(declaration))[0];
  const classification = program.operations.throwValue(statement);
  assert.ok(classification && classification.targetCarrier);
  const context = createCsharpPlanningContext(program);
  const diagnostics = [];
  assert.equal(planThrowStatement(statement, source.ast.getSourceFile(statement), context, diagnostics).length, 1);
  assert.deepEqual(diagnostics, []);
  for (const selected of [undefined, { ...classification, expression: declaration },
    { ...classification, sourceCarrier: csharpStringTargetType() }]) {
    const changed = { ...program, operations: { ...program.operations, throwValue: () => selected } };
    const diagnostics = [];
    assert.deepEqual(planThrowStatement(statement, source.ast.getSourceFile(statement),
      { ...context, program: changed }, diagnostics), []);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].message, "Throw expression has no exact sealed C# native error carrier classification.");
  }
  const changed = { ...program, operations: { ...program.operations,
    throwValue: () => ({ ...classification, targetCarrier: csharpStringTargetType() }) } };
  const invalid = [];
  assert.deepEqual(planThrowStatement(statement, source.ast.getSourceFile(statement), { ...context, program: changed }, invalid), []);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].message, "C# planning requires a sealed expression-conversion classification that analysis did not produce.");
});
