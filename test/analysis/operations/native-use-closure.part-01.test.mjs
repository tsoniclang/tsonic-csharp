import assert from "node:assert/strict";
import test from "node:test";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { assertPrimitiveOccurrences, assertPublishedRefusal, projectNodes } from "../../helpers/source-effective-types.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { emissionPrograms, discardedPrograms, owners } from "./native-use-closure.fixtures.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} nominal constructor receivers retain native static member ownership`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      export class Box { value: number = 4; static shared: number = 3; }
      export function run(): number { const box = new Box(); return box.value + Box.shared; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the constructor and both actual field declarations are valid");
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; "));
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the declared nominal class reaches native emission");
    const ast = program.source.syntax;
    const reads = [];
    const visit = node => {
      if (ast.is.IsPropertyAccessExpression(node) && ast.text(ast.name(node)) === "shared") reads.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(reads.length, 1, "the real static field read is unique");
    const member = program.records.sourceMember.get(reads[0]);
    assert.equal(member?.selectedReceiverType?.kind === "target-named" && member.objectShape === undefined, true,
      "a nominal constructor receiver is not converted to a delegate or an instance structural field inventory");
  });
}

for (const surface of Array.from(["js", "native"]).slice(0, 2)) {
for (const [label, program] of Array.from(emissionPrograms).slice(0, 16)) {
test(
  `${surface === "js" ? "" : "native "}sealed emission context covers ${label}`, () => {
  const sourceText = surface === "native" && label === "delete, void and typeof"
    ? `export function run(values: Record<string, number>, value: number): string {
        delete values["key"]; void value; return typeof value; }`
    : surface === "native" && label === "sequence spread" ? program.replace("values.length", "values.Length") : program;
  const compiled = compileCsharpNativeUseSource({ sourceText, surface });
  if (label === "accessor bodies") {
    assert.equal(compiled.sourceDiagnosticsText, "", compiled.sourceDiagnosticsText);
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => [code, message]),
      [["CSHARP_VALUE_USE_NOT_ADMITTED", "No exact C# implicit conversion relates 'source:float64' to 'source:int64'. Annotate the value with an integral type."]],
      `${label}: C2360 Q1 makes the original field or binding int64, which cannot receive a number write/default`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the original native write-fit refusal publishes nothing");
    return;
  }
  if (label === "compound and logical assignments and increments") {
    const inspected = { ...compiled, targetSource: compiled.nativeStage.source };
    const ast = inspected.targetSource.syntax;
    const destinations = projectNodes(inspected, (node, reader) => reader.is.IsVariableDeclaration(node) && reader.text(reader.name(node)) === "optional");
    assert.equal(destinations.length, 1, "the original concrete union destination is unique");
    assert.equal(compiled.result.diagnostics.find(issue => issue.code === "TSONIC_LOCAL_TYPE_UNION")?.sourceNode === destinations[0], true,
      "C9 refuses the identical original annotated destination, not a positive boolean result");
    const range = ast.authoredRange(destinations[0]);
    assert.equal(range.kind === "authored", true, "the original union use retains its authored occurrence");
    const siteText = ast.getSourceText(ast.getSourceFile(destinations[0])).slice(range.start, range.end);
    assertPublishedRefusal(inspected, "TSONIC_LOCAL_TYPE_UNION", siteText);
    return;
  }
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
});
if (label === "accessor bodies" || label === "parameter, pattern and lambda defaults") {
test(`${surface} an annotated ${label} companion preserves every sealed native operation`, () => {
  const sourceText = label === "accessor bodies"
    ? program.replace("stored = 1", "stored: number = 1")
    : program.replace("const [item = next()] = [1]", "const [item = next()]: number[] = [1]");
  assert.notEqual(sourceText, program, "only the incompatible field or destructuring destination receives its annotation");
  const compiled = compileCsharpNativeUseSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
});
}
if (label === "compound and logical assignments and increments") {
test(`${surface} an annotated compound and logical assignment source keeps every sealed native operation`, () => {
  const sourceText = 'import type { int32 } from "@tsonic/core/types.js";\n' +
    program.replace("let value = 1;", "let value: int32 = 1;");
  assert.equal(sourceText.includes("let value: int32 = 1;"), true, "only the original mutable local receives a concrete annotation");
  const compiled = compileCsharpNativeUseSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
  assertPrimitiveOccurrences({ ...compiled, targetSource: compiled.nativeStage.source }, "value", "int32");
});
}
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [label, statement] of Array.from(discardedPrograms).slice(0, 10)) {
test(
  `${surface} discarded callable ${label} is inactive, not a pending conversion`, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(flag: boolean, optional?: () => number): number { ${statement} return 5; }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    `${label}: ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.length > 0 && !output.includes("=>"), true, `${label}: no discarded closure allocation reaches emission`);
});
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} discarded callable branches retain every condition and operand effect`, () => {
  const compiled = compileCsharpSource({ sourceText: `
    let trace = 0;
    function tick(value: number): number { trace = trace * 10 + value; return value; }
    function condition(value: boolean, mark: number): boolean { tick(mark); return value; }
    function ready(): number { return 1; }
    export function run(flag: boolean): boolean {
      trace = 0;
      (() => tick(9)) as (() => number);
      (() => tick(9))!;
      <() => number>(() => tick(9));
      void (() => tick(9));
      condition(flag, 1) ? (() => tick(9)) : (() => tick(9));
      condition(flag, 2) ? (tick(3), (() => tick(9))) : (tick(4), (() => tick(9)));
      condition(flag, 5) && (tick(6), (() => tick(9)));
      condition(flag, 7) || (tick(8), (() => tick(9)));
      const optional: (() => number) | undefined = flag ? undefined : ready;
      optional ?? (tick(1), (() => tick(9)));
      (tick(2), (() => tick(9)));
      ((condition(flag, 3) ? (() => tick(9)) : (() => tick(9)))! satisfies (() => number));
      return trace === (flag ? 123567123 : 12457823);
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText, "", compiled.sourceDiagnosticsText);
  assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => [code, message]),
    [["CSHARP_VALUE_USE_NOT_ADMITTED", "No exact C# implicit conversion relates 'source:float64' to 'source:int64'. Annotate the value with an integral type."]],
    "C2360 Q1 makes the module-level unannotated trace Host-fixed int64, which cannot receive a number write");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "the original incompatible module write publishes no native output");
});
test(`${surface} an annotated discarded-callable trace preserves every condition and operand effect`,
  { timeout: 300_000 }, () => {
  const sourceText = `
    let trace = 0;
    function tick(value: number): number { trace = trace * 10 + value; return value; }
    function condition(value: boolean, mark: number): boolean { tick(mark); return value; }
    function ready(): number { return 1; }
    export function run(flag: boolean): boolean {
      trace = 0;
      (() => tick(9)) as (() => number);
      (() => tick(9))!;
      <() => number>(() => tick(9));
      void (() => tick(9));
      condition(flag, 1) ? (() => tick(9)) : (() => tick(9));
      condition(flag, 2) ? (tick(3), (() => tick(9))) : (tick(4), (() => tick(9)));
      condition(flag, 5) && (tick(6), (() => tick(9)));
      condition(flag, 7) || (tick(8), (() => tick(9)));
      const optional: (() => number) | undefined = flag ? undefined : ready;
      optional ?? (tick(1), (() => tick(9)));
      (tick(2), (() => tick(9)));
      ((condition(flag, 3) ? (() => tick(9)) : (() => tick(9)))! satisfies (() => number));
      return trace === (flag ? 123567123 : 12457823);
    }
  `;
  const compiled = compileCsharpSource({ sourceText: sourceText.replace("let trace = 0;", "let trace: number = 0;"), surface });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  executeCsharpConstruction(compiled, `discarded-callable-effect-order-${surface}`, false, false, [],
    `if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false)) throw new System.Exception("discarded callable effect order");`);
});
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} discarded coalescing preserves mixed presence, short circuits and zero native allocation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    class Trace { static value: number = 0; }
    function tick(value: number): number { Trace.value = Trace.value * 10 + value; return value; }
    function condition(value: boolean, mark: number): boolean { tick(mark); return value; }
    function ready(): number { return 1; }
    function fail(): never { tick(9); throw new Error("discarded branch"); }
    export function observed(): number { return Trace.value; }
    export function run(flag: boolean): number {
      Trace.value = 0;
      (condition(flag, 1) ? (tick(2), () => tick(9)) : (tick(3), undefined)) ?? (tick(4), () => tick(9));
      (condition(flag, 5) ? (tick(6), undefined) : (tick(7), () => tick(9))) ?? (tick(8), () => tick(9));
      (condition(true, 1) && (condition(flag, 2) ? (() => tick(9)) : (() => tick(9)))) ?? (tick(4), () => tick(9));
      const optional: number | undefined = flag ? undefined : 1;
      (tick(5), optional) ?? (tick(6), () => tick(9));
      return Trace.value;
    }
    export function rightThrow(flag: boolean): void {
      Trace.value = 0;
      (condition(flag, 1) ? (() => tick(9)) : undefined) ?? fail();
    }
    export function falseIsPresent(): number {
      Trace.value = 0;
      (condition(false, 1) && (() => tick(9))) ?? (tick(2), () => tick(9));
      return Trace.value;
    }
    export function nullIsAbsent(flag: boolean): number {
      Trace.value = 0;
      (condition(flag, 1) ? (tick(2), () => tick(9)) : (tick(3), null)) ?? (tick(4), () => tick(9));
      return Trace.value;
    }
    export function leftThrow(): void {
      Trace.value = 0;
      (fail(), ready()) ?? (tick(8), () => tick(9));
    }
    export function allocation(flag: boolean): number {
      const captured = flag ? 1 : 2;
      (flag ? (() => captured) : undefined) ?? (() => captured + 1);
      return captured;
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${surface}: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("=>"), false, "discarded capture functions never become native delegates");
  executeCsharpConstruction(compiled, `discarded-coalescing-presence-${surface}`, false, false, [], `
    if (Tsonic.Generated.Index.run(true) != 125681256 || Tsonic.Generated.Index.run(false) != 13457125)
      throw new System.Exception("mixed presence or operand order");
    if (Tsonic.Generated.Index.falseIsPresent() != 1) throw new System.Exception("false is present, not absent");
    if (Tsonic.Generated.Index.nullIsAbsent(true) != 12 || Tsonic.Generated.Index.nullIsAbsent(false) != 134)
      throw new System.Exception("native null and undefined share the selected absence contract");
    Tsonic.Generated.Index.rightThrow(true);
    if (Tsonic.Generated.Index.observed() != 1) throw new System.Exception("present branch must skip rejection");
    bool rightFailed = false;
    try { Tsonic.Generated.Index.rightThrow(false); } catch (System.Exception) { rightFailed = true; }
    if (!rightFailed || Tsonic.Generated.Index.observed() != 19) throw new System.Exception("absent branch must retain rejection");
    bool leftFailed = false;
    try { Tsonic.Generated.Index.leftThrow(); } catch (System.Exception) { leftFailed = true; }
    if (!leftFailed || Tsonic.Generated.Index.observed() != 9) throw new System.Exception("left rejection must skip all later work");
    for (int iteration = 0; iteration < 20000; iteration++) _ = Tsonic.Generated.Index.allocation((iteration & 1) == 0);
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    double total = 0;
    for (int iteration = 0; iteration < 20000; iteration++) total += Tsonic.Generated.Index.allocation((iteration & 1) == 0);
    long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (total != 30000 || allocated != 0) throw new System.Exception("discarded function allocation: " + allocated);
  `);
});
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} actual array and creation conversions close before structural publication`, () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    function readonlyValues(): readonly number[] { return [1, 2]; }
    function choose(flag: boolean): readonly number[] { return flag ? [1] : [2, 3]; }
    function identity(value: int32): number { return value; }
    export function run(flag: boolean): number {
      const values: readonly number[] = [...readonlyValues(), ...choose(flag)];
      const callback: (value: int32) => number = value => identity(value);
      void callback(1);
      return values.length;
    }
  `;
  const compiled = compileCsharpSource({ sourceText: surface === "native" ? sourceText.replace("values.length", "values.Length") : sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true, "actual construction conversions reach emission");
});
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} inferred async returns join native payloads once before constructing the task`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    function narrow(): int32 { return 3; }
    function wide(): int64 { return 9007199254740993n; }
    async function completed(): Promise<int64> { return wide(); }
    async function mixed(flag: boolean) { if (flag) return narrow(); return wide(); }
    async function optional(flag: boolean) { if (flag) return wide(); }
    async function pending() { return await completed(); }
    export async function run(): Promise<boolean> {
      return await mixed(true) === 3n && await mixed(false) === 9007199254740993n &&
        await optional(false) === undefined && await optional(true) === 9007199254740993n &&
        await pending() === 9007199254740993n;
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  executeCsharpConstruction(compiled, `native-async-payload-join-${surface}`, true);
});
}
