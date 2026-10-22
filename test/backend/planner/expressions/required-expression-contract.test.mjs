import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, withCsharpSessionRequest } from "../../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpAnalysisProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planExpression, planCallArgument } from "../../../../dist/backend/planner/expressions/index.js";
import * as expressionEntry from "../../../../dist/backend/planner/expressions/index.js";
import { planCsharpOutput } from "../../../../dist/backend/planner/program/planning.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/printer.js";
import { csharpAbsenceTargetType, csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../../dist/target-model/types/index.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/core.js";
import { requireExpressionPlan } from "../../../../dist/backend/planner/expressions/required-plan.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

function fixture() {
  const checkOptions = { surface: "js", sourceText: `
    export function run(): boolean { return parseInt("0x10", undefined) === 16; }
    export function effect(): void { void parseInt("10"); }
    export function fail(): never { throw new Error("failure"); }
  ` };
  const checked = checkCsharpSource(checkOptions);
  assert.equal(checked.sourceDiagnosticsText === "" && checked.extensionDiagnostics.length === 0, true,
    "ordinary source checks without annotations or altered semantics");
  return withCsharpSessionRequest(checkOptions, request => {
    const source = request.input.source;
    const providers = request.providers;
    const analysis = analyzeCsharpAnalysisProgram(request);
    assert.equal(analysis.kind === "resolved" && analysis.diagnostics.length === 0, true, "baseline analysis succeeds");
    const program = analysis.value;
    const nodes = [];
    const pending = [...csharpProgramSourceFiles(program)];
    while (pending.length !== 0) {
      const node = pending.pop();
      nodes.push(node);
      source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    const call = nodes.find(node => source.ast.is.IsCallExpression(node)
      && program.records.selectedCall.get(node)?.source.sourceArguments.length === 2);
    assert.equal(call !== undefined, true, "exact original call with explicitly absent radix");
    const classification = program.records.selectedCall.get(call);
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
    const actual = program.records.nativeExpression.get(radix);
    assert.equal(actual !== undefined && actual.use.kind !== "erased", true, "the original argument has its exact native context");
    const wrongUse = Object.freeze({ ...actual.use, kind: "converted", carrier: absence,
      input: Object.freeze({ kind: "value", type: absence }), completion: Object.freeze({ kind: "value", type: number }),
      target: number, mode: "implicit", literal: undefined });
    const changed = Object.freeze({ ...program,
      records: Object.freeze({ ...program.records,
        nativeUse: Object.freeze({ get: site => site === actual.site ? wrongUse : program.records.nativeUse.get(site) }),
        nativeExpression: Object.freeze({ get: node => node === radix
          ? Object.freeze({ ...actual, use: wrongUse, physical: actual.physical ?? actual.use, conversion: rejection })
          : program.records.nativeExpression.get(node) }),
        selectedCall: Object.freeze({ get: node => node === call ? Object.freeze({ ...classification,
          target: Object.freeze({ ...classification.target, call: wrongCall }) }) : program.records.selectedCall.get(node) }),
        expressionConversion: Object.freeze({ get: (node, from, to, mode) => node === radix && mode === "implicit"
          && targetTypeRefEquals(from, absence) && targetTypeRefEquals(to, number)
          ? rejection : program.records.expressionConversion.get(node, from, to, mode) }) }),
    });
    return { source, program, changed, call, radix, number, rejection };
  }).value;
}

test("required expression boundaries diagnose silent rejected conversions without accepting omitted source", () => {
  const current = fixture();
  const file = current.source.ast.getSourceFile(current.radix);
  const context = createCsharpPlanningContext(current.changed);
  assert.equal(Object.hasOwn(expressionEntry, "planExpressionWithExpectedType"), false, "the superseded hint-based API is absent");
  const planners = [
    ["untyped", diagnostics => planExpression(current.call, file, context, diagnostics)],
    ["exact native expression", diagnostics => planExpression(current.radix, file, context, diagnostics)],
    ["argument", diagnostics => planCallArgument(current.radix, file, context, diagnostics,
      current.number)],
  ];
  for (const [name, plan] of planners) for (const prior of [[], [
    { code: "PRIOR", category: "error", source: "test", message: "Unrelated existing error." },
  ]]) {
    const diagnostics = [...prior];
    const message = `C# conversion reached planning after pre-seal refusal: ${current.rejection.reason}`;
    assert.throws(() => plan(diagnostics), error => error instanceof Error && error.phase === "planning" &&
      error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
      error.diagnostic.source === "tsonic-csharp" && error.diagnostic.sourceNode === current.radix &&
      error.message === message && error.diagnostic.message === message,
    `${name}: the identical refused native pair is post-seal corruption at the exact radix`);
    assert.equal(diagnostics.length === prior.length && diagnostics.every((diagnostic, index) => diagnostic === prior[index]),
      true, `${name}: prior diagnostics are unchanged and no source error is appended`);
  }
  const message = `C# conversion reached planning after pre-seal refusal: ${current.rejection.reason}`;
  assert.throws(() => planCsharpOutput(createCsharpPlanningContext(current.changed)),
    error => error instanceof Error && error.phase === "planning" &&
      error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
      error.diagnostic.source === "tsonic-csharp" && error.diagnostic.sourceNode === current.radix &&
      error.message === message && error.diagnostic.message === message,
    "complete output refuses the same corrupted program instead of publishing an empty boolean method");
});

test("the required-expression guard preserves undefined, specific and prior-error predicates", () => {
  const current = fixture();
  const priorError = Object.freeze({ code: "PRIOR", category: "error", source: "test", message: "Unrelated existing error." });
  const specificError = Object.freeze({ code: "SPECIFIC", category: "error", source: "test", message: "Exact owning rejection." });
  const warning = Object.freeze({ code: "WARNING", category: "warning", source: "test", message: "Warning is not a rejection." });
  for (const [name, prior] of [["no prior error", []], ["prior error", [priorError]]]) {
    const missing = [...prior];
    assert.equal(requireExpressionPlan(current.radix, missing, () => undefined) === undefined, true, `${name}: absent completion stays absent`);
    assert.equal(missing.length, prior.length + 1, `${name}: exactly one new guard diagnostic`);
    assert.equal(missing.at(-1).category === "error" && missing.at(-1).sourceNode === current.radix, true,
      `${name}: the guard names the exact required expression`);
    assert.equal(/Required C# expression planning/.test(missing.at(-1).message), true,
      `${name}: the original required-expression assertion remains at its guard owner`);
    const specific = [...prior];
    const rejected = requireExpressionPlan(current.radix, specific, () => { specific.push(specificError); return undefined; });
    assert.equal(rejected === undefined, true, `${name}: a specific rejection has no completion`);
    assert.equal(specific.length === prior.length + 1 && specific.at(-1) === specificError, true,
      `${name}: the specific owning error is retained without duplication`);
    const valid = [...prior];
    assert.equal(requireExpressionPlan(current.radix, valid, () => 7), 7, `${name}: a valid native completion is preserved`);
    assert.equal(valid.length, prior.length, `${name}: a valid completion adds no diagnostic`);
    const warnings = [...prior];
    const warned = requireExpressionPlan(current.radix, warnings, () => { warnings.push(warning); return undefined; });
    assert.equal(warned === undefined, true, `${name}: a warning cannot fabricate a completion`);
    assert.equal(warnings.length === prior.length + 2 && warnings[prior.length] === warning
      && warnings.at(-1).category === "error" && /Required C# expression planning/.test(warnings.at(-1).message), true,
    `${name}: warnings and prior errors cannot mask the missing current completion`);
  }
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
    records: Object.freeze({ ...current.program.records,
      sourceArgument: Object.freeze({ get: node => node === current.call ? undefined : current.program.records.sourceArgument.get(node) }) }),
  });
  const diagnostics = [];
  const planned = planExpression(current.call, current.source.ast.getSourceFile(current.call),
    createCsharpPlanningContext(specific), diagnostics);
  assert.equal(planned === undefined, true, "missing exact evidence still rejects");
  assert.equal(diagnostics.length === 1 && /without sealed argument-passing evidence/.test(diagnostics[0].message), true,
    "specific owning error is not duplicated by the required-expression guard");
});
