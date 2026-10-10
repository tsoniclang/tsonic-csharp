import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planExpression, planExpressionWithExpectedType, planCallArgument } from "../../../../dist/backend/planner/expressions/index.js";
import { planCsharpOutput } from "../../../../dist/backend/planner/program/planning.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/printer.js";
import { csharpAbsenceTargetType, csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../../dist/target-model/types/index.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/selection/core.js";
import { csharpTypeFromTargetTypeRef } from "../../../../dist/backend/planner/types/target-types.js";

function fixture() {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean { return parseInt("0x10", undefined) === 16; }
    export function effect(): void { void parseInt("10"); }
    export function fail(): never { throw new Error("failure"); }
  ` });
  assert.equal(checked.sourceDiagnosticsText === "" && checked.extensionDiagnostics.length === 0, true,
    "ordinary source checks without annotations or altered semantics");
  const source = createTargetSourceProgram(checked.source);
  const providers = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] });
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers,
  });
  assert.equal(analysis.kind === "resolved" && analysis.diagnostics.length === 0, true, "baseline analysis succeeds");
  const program = analysis.value;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length !== 0) {
    const node = pending.pop();
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const call = nodes.find(node => source.ast.is.IsCallExpression(node)
    && program.operations.call(node)?.source.sourceArguments.length === 2);
  assert.equal(call !== undefined, true, "exact original call with explicitly absent radix");
  const classification = program.operations.call(call);
  assert.equal(classification?.target?.kind === "resolved", true, "native operation is finalized");
  const selected = classification.target.call;
  const radix = classification.source.sourceArguments[1].expression;
  const number = csharpSourcePrimitiveTargetType("float64");
  const absence = csharpAbsenceTargetType();
  const rejection = Object.freeze(selectCsharpConversion({
    typeDefinitions: program.typeDefinitions, projectTypes: program.projectTypes,
    objectShapes: program.objectShapes, providers, target: checked.target,
  }, absence, number, "implicit"));
  assert.equal(rejection.kind === "rejected", true, "real native absence-to-number conversion rejects");
  const original = selected.arguments.find(argument => argument.sourceArgumentIndex === 1).targetParameter;
  const parameter = Object.freeze({ ...original, type: number });
  const wrongCall = Object.freeze({ ...selected,
    targetMember: Object.freeze({ ...selected.targetMember,
      parameters: Object.freeze(selected.targetMember.parameters.map((value, index) => index === 1 ? parameter : value)) }),
    arguments: Object.freeze(selected.arguments.map(argument => argument.sourceArgumentIndex === 1
      ? Object.freeze({ ...argument, targetParameter: parameter }) : argument)),
  });
  const changed = Object.freeze({ ...program,
    operations: Object.freeze({ ...program.operations,
      call: node => node === call ? Object.freeze({ ...classification,
        target: Object.freeze({ ...classification.target, call: wrongCall }) }) : program.operations.call(node) }),
    conversions: Object.freeze({ ...program.conversions,
      selectExpression: (node, from, to, mode) => node === radix && mode === "implicit"
        && targetTypeRefEquals(from, absence) && targetTypeRefEquals(to, number)
        ? rejection : program.conversions.selectExpression(node, from, to, mode) }),
  });
  return { source, program, changed, call, radix, number };
}

test("required expression boundaries diagnose silent rejected conversions without accepting omitted source", () => {
  const current = fixture();
  const file = current.source.ast.getSourceFile(current.radix);
  const context = createCsharpPlanningContext(current.changed);
  const type = csharpTypeFromTargetTypeRef(current.number);
  const planners = [
    ["untyped", diagnostics => planExpression(current.call, file, context, diagnostics)],
    ["expected", diagnostics => planExpressionWithExpectedType(current.radix, file, context, diagnostics,
      type, current.radix, undefined, current.number)],
    ["argument", diagnostics => planCallArgument(current.radix, file, context, diagnostics,
      type, current.radix, current.number)],
  ];
  for (const [name, plan] of planners) for (const prior of [[], [
    { code: "PRIOR", category: "error", source: "test", message: "Unrelated existing error." },
  ]]) {
    const diagnostics = [...prior];
    assert.equal(plan(diagnostics) === undefined, true, `${name}: rejected plan remains absent`);
    assert.equal(diagnostics.length === prior.length + 1, true, `${name}: exactly one new owning error`);
    assert.equal(diagnostics.at(-1).category === "error"
      && /Required C# expression planning/.test(diagnostics.at(-1).message), true,
    `${name}: prior errors cannot hide a missing current completion`);
  }
  const rejected = planCsharpOutput(createCsharpPlanningContext(current.changed));
  assert.equal(rejected.kind === "rejected" && rejected.diagnostics.some(diagnostic => diagnostic.category === "error"), true,
    "complete output rejects instead of publishing an empty boolean method");
});

test("required planning retains specific errors and valid value, void and never completions", () => {
  const current = fixture();
  const baseline = planCsharpOutput(createCsharpPlanningContext(current.program));
  assert.equal(baseline.kind === "resolved" && baseline.diagnostics.length === 0, true,
    "native absence, value, void and never plans remain valid");
  const output = baseline.value.sources.map(source => printCsharpCompilationUnit(source.unit)).join("\n");
  assert.equal(/public static bool run\(\)[\s\S]*?return/.test(output), true, "valid source keeps its return");
  assert.equal(/public static void effect\(\)/.test(output) && /public static[\s\S]*?fail\(/.test(output), true,
    "void and never functions remain explicitly represented");
  const specific = Object.freeze({ ...current.program,
    sourceEvidence: Object.freeze({ ...current.program.sourceEvidence,
      argument: node => node === current.call ? undefined : current.program.sourceEvidence.argument(node) }),
  });
  const diagnostics = [];
  const planned = planExpression(current.call, current.source.ast.getSourceFile(current.call),
    createCsharpPlanningContext(specific), diagnostics);
  assert.equal(planned === undefined, true, "missing exact evidence still rejects");
  assert.equal(diagnostics.length === 1 && /without sealed argument-passing evidence/.test(diagnostics[0].message), true,
    "specific owning error is not duplicated by the required-expression guard");
});
