import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { admitCsharpNativeStorageBindings } from "../../../../dist/analysis/control-flow/native-control-flow.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { planLocalDeclaration } from "../../../../dist/backend/planner/bindings/locals.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

for (const surface of ["native", "js"]) {
  test(`generic initializer-less absence uses its selected native witness on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      function absent<T>(input: T, flag: boolean): boolean {
        let value: T | undefined;
        if (flag) value = input;
        return value === undefined;
      }
      export function checkInt(flag: boolean): boolean { return absent<int>(7, flag); }
      export function checkString(flag: boolean): boolean { return absent<string>("value", flag); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "native generic optional storage is checked source");
    assert.equal(compiled.targetDiagnostics.length, 0, "generic absence uses the one selected storage contract");
    const output = compiled.artifacts.get("src/Index.cs");
    assert.match(output, /\.From1\(null\)/u, "the optional-storage witness explicitly constructs its absent arm");
    assert.doesNotMatch(output, /\bvalue = default/u, "generic absence never guesses the storage's default tag");
    executeCsharpConstruction(compiled, `generic-local-absence-${surface}`, false, false, [], `
using Index = Tsonic.Generated.Index;
for (var warmup = 0; warmup < 1000; warmup++) {
    var flag = (warmup & 1) == 0;
    if (Index.checkInt(flag) != !flag || Index.checkString(flag) != !flag)
        throw new System.Exception("generic native absence witness");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
var generated = 0;
for (var iteration = 0; iteration < 10000; iteration++) {
    var flag = (iteration & 1) == 0;
    if (Index.checkInt(flag)) generated++;
    if (Index.checkString(flag)) generated++;
}
var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var native = 0;
for (var iteration = 0; iteration < 10000; iteration++) {
    var flag = (iteration & 1) == 0;
    int? number = null;
    string? text = null;
    if (flag) { number = 7; text = "value"; }
    if (number is null) native++;
    if (text is null) native++;
}
var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != 10000 || generated != native || generatedBytes != nativeBytes)
    throw new System.Exception($"generic absence {generated}/{native}, allocation {generatedBytes}/{nativeBytes}");
`);
  });
}

test("direct C# translation initializes undefined storage and closes recursive local callables", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function choose(flag: boolean): string | undefined {
        let value: string | undefined;
        if (flag) value = "yes";
        return value;
      }
      export function walk(values: string[]): number {
        let count = 0;
        const visit = (index: number): void => {
          if (index >= values.Length) return;
          count++;
          visit(index + 1);
        };
        visit(0);
        return count;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string? choose(bool flag)
        {
            string? value = default(string?);
            if (flag)
            {
                value = "yes";
            }
            return value;
        }
        public static double walk(string[] values)
        {
            ObjectShape_capture_ffef __tsonic_captures0 = new ObjectShape_capture_ffef
            {
                value0 = default(Action<double>)!,
                value1 = default(string[])!,
                value2 = default(double)!,
            };
            __tsonic_captures0.value1 = values;
            __tsonic_captures0.value2 = 0;
            __tsonic_captures0.value0 = __tsonic_captures0.invoke0;
            __tsonic_captures0.value0(0);
            return __tsonic_captures0.value2;
        }
    }
}
`);
  executeCsharpConstruction(compiled, "recursive-local-storage-cost", false, false, [], `
using Index = Tsonic.Generated.Index;
if (Index.choose(false) != null || Index.choose(true) != "yes") throw new System.Exception("native absence initialization");
var values = new string[8];
for (var warmup = 0; warmup < 10000; warmup++) {
    if (Index.walk(values) != 8 || Handwritten(values) != 8) throw new System.Exception("recursive local execution");
}
double generatedTotal = 0;
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) generatedTotal += Index.walk(values);
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
double nativeTotal = 0;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) nativeTotal += Handwritten(values);
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedTotal != 80000 || nativeTotal != generatedTotal || generatedCost != nativeCost)
    throw new System.Exception($"recursive activation allocation {generatedCost} != {nativeCost}");
static double Handwritten(string[] values) {
    double count = 0;
    System.Action<double> visit = null!;
    visit = index => {
        if (index >= values.Length) return;
        count++;
        visit(index + 1);
    };
    visit(0);
    return count;
}
`);
});

test("initializer-less native locals use definite assignment and retain captured storage", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function assigned(): number {
      let value: number;
      value = 7;
      return value;
    }
    export function captured(): number {
      let value: number;
      const read = (): number => value;
      value = 9;
      return read();
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "native definite assignment is valid checked source");
  assert.equal(compiled.extensionDiagnostics.length, 0, "native locals require no extra source annotation");
  assert.equal(compiled.targetDiagnostics.length, 0, "local and captured physical storage are admitted");
  assert.match(compiled.artifacts.get("src/Index.cs"), /double value;/u,
    "non-absence storage is declared without a fabricated absence initializer");
  executeCsharpConstruction(compiled, "native-uninitialized-locals", false, false, [], `
if (Tsonic.Generated.Index.assigned() != 7 || Tsonic.Generated.Index.captured() != 9)
    throw new System.Exception("native definite-assignment and capture controls");
`);
});

test("local storage has one final carrier and no syntax, lambda or source-evidence arbitration", () => {
  const compiled = compileCsharpSource({ sourceText:
    "export function run(): number { let value: number = 7; return value; }" });
  assert.equal(compiled.sourceDiagnosticsText, "", "the local carrier control is checked source");
  assert.equal(compiled.targetDiagnostics.length, 0, "the local carrier control is admitted");
  const program = compiled.result.program;
  const ast = program.source.ast;
  let declaration;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) declaration = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(declaration !== undefined, true, "the local's exact declaration is retained");
  const file = ast.getSourceFile(declaration);
  const selected = program.records.storageType.get(declaration);
  assert.equal(selected?.kind === "source-primitive" && selected.name === "float64", true,
    "storage analysis has already selected the native local carrier");
  const input = createCsharpPlanningContext({ ...program, records: { ...program.records,
    storageTargetType: { get() { throw new Error("the local renderer must not arbitrate the source carrier"); } } } });
  const diagnostics = [];
  const planned = planLocalDeclaration(declaration, file, input, diagnostics, createDestructuringPlannerState(declaration, ast),
    { kind: "LiteralExpression", value: 7 });
  assert.equal(planned.type.kind === "PredefinedType" && planned.type.name === "double", true,
    "the exact final carrier renders directly");
  assert.equal(planned.initializer.completion.carrier === selected, true,
    "the initializer uses that same native carrier identity");
  assert.equal(diagnostics.length, 0, "the renderer performs no new source classification");
  for (const control of [
    { label: "absent storage", type: undefined, message: "finalized native storage carrier" },
    { label: "unrenderable storage", type: { kind: "opaque", id: "missing" }, message: "renderable native storage carrier" },
  ]) {
    // The renderer reads the sealed local binding completion, whose carrier analysis selected from the storage record.
    const corrupted = createCsharpPlanningContext({ ...program, records: { ...program.records,
      localBinding: { get: node => node === declaration
        ? { ...program.records.localBinding.get(node), carrier: control.type } : program.records.localBinding.get(node) } } });
    assert.throws(() => planLocalDeclaration(declaration, file, corrupted, diagnostics,
      createDestructuringPlannerState(declaration, ast), { kind: "LiteralExpression", value: 7 }),
    error => error.message.includes(control.message), `${control.label}: only corrupted admitted storage is an invariant`);
  }
  const opaque = Object.freeze({ kind: "opaque", id: "missing" });
  // The pre-seal admission reads the analysis native-use catalog, whose construct order marks the declaration as
  // admitted native code; the sealed record carries only expression uses.
  const nativeUse = { ...program.records.nativeUse, order: node => node === declaration ? [] : undefined };
  const issues = admitCsharpNativeStorageBindings(ast, [declaration], nativeUse,
    { ...program.records, storageType: { get: () => opaque } }, program.records.nativeRefReturn,
    program.records.nativeParticipation, program.records.compileTimeMetadata, program.records.nativeUnreachable);
  assert.equal(issues.length, 1, "the actual pre-seal owner refuses an unrenderable local carrier once");
  assert.equal(issues[0].code, "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED", "the original code is preserved");
  assert.equal(issues[0].message, "Opaque target type 'missing' has no renderable C# source representation.",
    "the original carrier refusal is preserved");
  assert.equal(issues[0].sourceNode === ast.as.AsVariableDeclaration(declaration).Type, true,
    "the refusal remains on the exact authored type annotation");
});

test("iteration and catch bindings stay with their admitted owners rather than local-declaration storage", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(values: number[]): number {
      for (const value of values) return value;
      try { throw new Error("missing"); } catch (error) { return 0; }
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the independent binding-owner control is checked source");
  assert.equal(compiled.targetDiagnostics.length, 0, "iteration and catch owners admit their exact native bindings");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const bindings = [];
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) bindings.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(bindings.length, 2, "the exact iteration and catch declarations are both observed");
  const issues = admitCsharpNativeStorageBindings(ast, bindings, { order: () => [] }, {
    nativeBacking: { get: () => undefined }, nativeArray: { get: () => undefined },
    storageType: { get() { throw new Error("a different binding owner must not read ordinary local storage"); } },
  }, program.records.nativeRefReturn, program.records.nativeParticipation,
  program.records.compileTimeMetadata, program.records.nativeUnreachable);
  assert.equal(issues.length, 0, "no ordinary-local renderability rule is imposed on another admitted binding owner");
});
