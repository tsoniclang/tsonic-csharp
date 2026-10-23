import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const emissionPrograms = [
  ["class and static initializers", `
    function next(): number { return 3; }
    export class Box { value = next(); static shared = next(); }
    export function run(): number { const box = new Box(); return box.value + Box.shared; }`],
  ["base constructor arguments", `import type { int32 } from "@tsonic/core/types.js";
    export class Base { value: int32; constructor(value: int32) { this.value = value; } }
    export class Derived extends Base { constructor() { super(7 / 2); } }
    export function run(): int32 { return new Derived().value; }`],
  ["parameter, pattern and lambda defaults", `
    function next(): number { return 3; }
    function parameter(value: number = next()): number { return value; }
    function pattern([value = next()]: number[]): number { return value; }
    export function run(): number { const callback = (value: number = next()) => value;
      const [item = next()] = [1]; return parameter() + pattern([]) + callback() + item; }`],
  ["template spans", 'export function run(value: number): string { return `value=${value},next=${value + 1}`; }'],
  ["switch cases", `export function run(value: number): number {
    switch (value) { case 1: return 3; case 2: return 4; default: return 5; } }`],
  ["optional chains", `export interface Box { value: number; }
    export function run(box?: Box): number { return box?.value ?? 3; }`],
  ["sequence spread", `function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number { const result = [1, ...values, 2]; return sum(...result); }`],
  ["await operands", `async function first(): Promise<number> { return 3; }
    export async function run(): Promise<number> { return await first(); }`],
  ["yield operands", `import type { int32 } from "@tsonic/core/types.js";
    export function* run(): Generator<int32, string, unknown> { yield 1; yield 2; return "done"; }`],
  ["delete, void and typeof", `export function run(values: number[], value: number): string {
    delete values[0]; void value; return typeof value; }`],
  ["comma expression", `export function run(): number { let value = 0; return (value++, value + 1); }`],
  ["accessor bodies", `export class Box { stored = 1; get value(): number { return this.stored; }
    set value(next: number) { this.stored = next; } }
    export function run(): number { const box = new Box(); box.value = 3; return box.value; }`],
  ["IIFE callee", `export function run(value: number): number { return ((next: number) => next + 1)(value); }`],
  ["module and default export", `function next(): number { return 3; }
    const value = next(); export default value;`],
  ["compound and logical assignments and increments", `export function run(): number {
    let value = 1; value += 2; value++; --value; let optional: number | undefined = value; optional ??= 4; return optional; }`],
  ["attribute argument metadata", `import { attribute } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Box { run(): void {} }
    attribute<Box>().add(() => new ObsoleteAttribute("old", false));`],
];

for (const surface of ["js", "native"]) for (const [label, program] of emissionPrograms) test(
  `${surface === "js" ? "" : "native "}sealed emission context covers ${label}`, () => {
  const sourceText = surface === "native" && label === "delete, void and typeof"
    ? `export function run(values: Record<string, number>, value: number): string {
        delete values["key"]; void value; return typeof value; }`
    : surface === "native" && label === "sequence spread" ? program.replace("values.length", "values.Length") : program;
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
});

const discardedPrograms = [
  ["as", "(() => 1) as (() => number);"],
  ["non-null", "(() => 1)!;"],
  ["type assertion", "<() => number>(() => 1);"],
  ["void", "void (() => 1);"],
  ["conditional", "flag ? () => 1 : () => 2;"],
  ["logical and", "flag && (() => 1);"],
  ["logical or", "flag || (() => 1);"],
  ["coalescing", "optional ?? (() => 1);"],
  ["comma", "(flag = !flag, (() => 1));"],
  ["nested wrappers", "((flag ? (() => 1) : (() => 2))! satisfies (() => number));"],
];

for (const surface of ["native", "js"]) for (const [label, statement] of discardedPrograms) test(
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

for (const surface of ["native", "js"]) test(`${surface} discarded callable branches retain every condition and operand effect`,
  { timeout: 300_000 }, () => {
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
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  executeCsharpConstruction(compiled, `discarded-callable-effect-order-${surface}`, false, false, [],
    `if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false)) throw new System.Exception("discarded callable effect order");`);
});

for (const surface of ["native", "js"]) test(`${surface} discarded coalescing preserves mixed presence, short circuits and zero native allocation`,
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

for (const surface of ["native", "js"]) test(`${surface} actual array and creation conversions close before structural publication`, () => {
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

for (const surface of ["native", "js"]) test(`${surface} inferred async returns join native payloads once before constructing the task`,
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

for (const surface of ["native", "js"]) test(`${surface} numeric spread carriers are order-independent without erasing genuine native unions`,
  { timeout: 300_000 }, () => {
  const sourceText = `
    import type { int32, uint32, int64, float64 } from "@tsonic/core/types.js";
    function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number {
      const prefix = [1, ...values, 2];
      const suffix = [...values, 1, 2];
      return sum(...prefix) + sum(...suffix);
    }
    export function permutations(signed: int32, unsigned: uint32): boolean {
      const left = [signed, unsigned, 0.5];
      const middle = [signed, 0.5, unsigned];
      const right = [0.5, signed, unsigned];
      return left[0] === signed && left[1] === unsigned && left[2] === 0.5 && middle[0] === signed &&
        middle[1] === 0.5 && middle[2] === unsigned && right[0] === 0.5 && right[1] === signed && right[2] === unsigned;
    }
    export function nativePairs(signed: int32, unsigned: uint32): boolean {
      const narrow = [signed, 1];
      const narrowReverse = [1, signed];
      const narrowLeft = [signed, 1, 2];
      const narrowMiddle = [1, signed, 2];
      const narrowRight = [1, 2, signed];
      const bare = [signed, unsigned];
      const explicit: number[] = [signed, unsigned, 0.5];
      void bare;
      return narrow[0] === signed && narrow[1] === 1 &&
        narrowReverse[0] === 1 && narrowReverse[1] === signed &&
        narrowLeft[0] === signed && narrowLeft[1] === 1 && narrowLeft[2] === 2 &&
        narrowMiddle[0] === 1 && narrowMiddle[1] === signed && narrowMiddle[2] === 2 &&
        narrowRight[0] === 1 && narrowRight[1] === 2 && narrowRight[2] === signed &&
        explicit[0] === signed && explicit[1] === unsigned && explicit[2] === 0.5;
    }
    export function literalBoundaries(signed: int32): boolean {
      const boundary = [signed, 2147483648];
      const explicitDouble = [signed, 1 as float64];
      return boundary[0] === signed && boundary[1] === 2147483648 &&
        explicitDouble[0] === signed && explicitDouble[1] === 1;
    }
    export function preserveNegativeZero(signed: int32): number {
      const signedZeros = [signed, -0 as float64];
      return signedZeros[1];
    }
    ${surface !== "js" ? "" : `export function authoredNegativeZero(signed: int32): number {
      const authoredZeros = [signed, -0];
      return authoredZeros[1];
    }`}
    const narrow: int32 = 1;
    const wide: int64 = 9007199254740993n;
    export const distinct = [narrow, wide];
    export const homogeneousWide = [wide, wide];
  `;
  const compiled = compileCsharpSource({ sourceText: surface === "native" ? sourceText.replace("values.length", "values.Length") : sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(compiled.targetDiagnostics.length === 0 && program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const arrays = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const declaration = ast.as.AsVariableDeclaration(node);
      const initializer = declaration?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) {
        arrays.set(ast.text(ast.name(node)), getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  for (const name of ["prefix", "suffix", "left", "middle", "right"]) assert.equal(arrays.get(name)?.kind === "source-primitive" &&
    arrays.get(name)?.name === "float64", true, `${name}: actual double spread and numeric literals share the same native carrier`);
  assert.equal(arrays.get("narrow")?.kind === "source-primitive" && arrays.get("narrow")?.name === "int32", true,
    "an actual native int32 and its exact integer literal retain the admitted int32 carrier");
  for (const name of ["narrowReverse", "narrowLeft", "narrowMiddle", "narrowRight"]) assert.equal(
    arrays.get(name)?.kind === "source-primitive" && arrays.get(name)?.name === "int32", true,
    `${name}: native int32 and representable integer literals retain their carrier in every peer position`);
  for (const name of ["boundary", "explicitDouble", "signedZeros"]) assert.equal(
    arrays.get(name)?.kind === "source-primitive" && arrays.get(name)?.name === "float64", true,
    `${name}: native range, explicit float64 and signed zero prevent integral literal retargeting`);
  if (surface === "js") assert.equal(arrays.get("authoredZeros")?.kind === "source-primitive" &&
    arrays.get("authoredZeros")?.name === "float64", true, "the actual JS float64 negative-zero literal keeps its native floating carrier");
  const bare = getCsharpRuntimeUnionArms(arrays.get("bare"), program.typeDefinitions);
  assert.equal(bare?.length === 2 && bare.some(type => type.kind === "source-primitive" && type.name === "int32") &&
    bare.some(type => type.kind === "source-primitive" && type.name === "uint32"), true,
    "a bare signed/unsigned pair retains its existing checked union, never a synthetic wider carrier");
  assert.equal(arrays.get("explicit")?.kind === "source-primitive" && arrays.get("explicit")?.name === "float64", true,
    "an explicitly authored number array retains its actual native float64 contract");
  const distinct = getCsharpRuntimeUnionArms(arrays.get("distinct"), program.typeDefinitions);
  assert.equal(distinct?.length === 2 && distinct.some(type => type.kind === "source-primitive" && type.name === "int32") &&
    distinct.some(type => type.kind === "source-primitive" && type.name === "int64"), true,
    "a genuine checked union preserves both explicit native widths");
  assert.equal(arrays.get("homogeneousWide")?.kind === "source-primitive" && arrays.get("homogeneousWide")?.name === "int64", true,
    "a homogeneous native int64 array never takes a floating route");
  executeCsharpConstruction(compiled, `native-array-common-carrier-${surface}`, false, false, [],
    `if (Tsonic.Generated.Index.run(${surface === "native" ? "new double[] { 3, 4 }"
      : "new Tsonic.CSharp.Js.JSArray<double>(new double[] { 3, 4 })"}) != 8 ||
      !Tsonic.Generated.Index.permutations(-7, 4294967295U) ||
      !Tsonic.Generated.Index.nativePairs(-7, 4294967295U) ||
      !Tsonic.Generated.Index.literalBoundaries(-7) ||
      System.BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.preserveNegativeZero(-7)) != long.MinValue ||
      ${surface !== "js" ? "" : "System.BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.authoredNegativeZero(-7)) != long.MinValue ||"}
      Tsonic.Generated.Index.homogeneousWide[0] != 9007199254740993L) throw new System.Exception("native array common carrier");`);
});

for (const surface of ["native", "js"]) test(`${surface} a named interface property has no inferred physical native-field guarantee`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")], sourceText: `
    import { abi } from "test:abi";
    import { memorylayout, addressof, torawptr, reinterpretrawptr, loadptr, storeptr, unsafecontext } from "@tsonic/core/lang.js";
    import type { uint32 } from "@tsonic/core/types.js";
    const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
    interface Box { value: uint32; }
    function create() { const value: uint32 = 7; return { value, extra: true }; }
    function change(factory: () => Box): boolean {
      unsafecontext();
      const box = factory();
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return box.value === 9 && loadptr(pointer) === 9;
    }
    export function run(): boolean { return change(create); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program === undefined, true, "the existing field-backing refusal precedes publication");
  assert.equal(compiled.targetDiagnostics.length === 1 && compiled.targetDiagnostics[0].code === "CSHARP_NATIVE_BACKING_NOT_PROVEN" &&
    compiled.targetDiagnostics[0].message === "Native field backing requires one complete compiler-owned mutable data field.", true,
    "a named interface's accessor contract is not invented physical field evidence");
  assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), false, "no refused native program is emitted");
});

for (const surface of ["native", "js"]) test(`${surface} actual structural callable returns retain every native-backed physical implementation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")], sourceText: `
    import { abi } from "test:abi";
    import { memorylayout, addressof, torawptr, reinterpretrawptr, loadptr, storeptr, unsafecontext } from "@tsonic/core/lang.js";
    import type { uint32 } from "@tsonic/core/types.js";
    const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
    type Box = { value: uint32 };
    type Wide<Payload> = { value: uint32; payload: Payload };
    function create() { const value: uint32 = 7; return { value, extra: true }; }
    function createOther() { const value: uint32 = 7; return { value, label: "other" }; }
    function createWide(): Wide<number> { const value: uint32 = 7; return { value, payload: 0.5 }; }
    function coerce<Payload>(value: Wide<Payload>): Box { return value; }
    function transitiveFactory(): Box { return coerce(createWide()); }
    function change(factory: () => Box): boolean {
      unsafecontext();
      const box = factory();
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return box.value === 9 && loadptr(pointer) === 9;
    }
    export function run(): boolean { return change(create); }
    export function runOther(): boolean { return change(createOther); }
    export function runTransitive(): boolean { return change(transitiveFactory); }
    export function crossAlias(): boolean {
      unsafecontext();
      const original = createWide();
      const box = coerce(original);
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return original.value === 9 && box.value === 9 && loadptr(pointer) === 9;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const producers = [];
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node) && ["create", "createOther"].includes(ast.text(ast.name(node)))) producers.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(producers.length, 2, "both actual checked callable producers are present");
  for (const producer of producers) {
    const contract = program.records.returnContract.get(producer);
    assert.equal(contract?.kind === "resolved" && program.records.nativeField.get(contract.type, "value") !== undefined, true,
      `${ast.text(ast.name(producer))}: final backing contains the actual late structural implementation`);
  }
  executeCsharpConstruction(compiled, `native-backed-structural-return-${surface}`, false, true, [],
    `if (!Tsonic.Generated.Index.run() || !Tsonic.Generated.Index.runOther() || !Tsonic.Generated.Index.runTransitive() ||
      !Tsonic.Generated.Index.crossAlias()) throw new System.Exception("native field aliases through concrete, transitive and generic structural factories");`);
});

for (const surface of ["native", "js"]) test(`${surface} actual native delegate variance preserves identity and allocates no adapter`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type Product = { value: int32; extra: boolean };
    type View = { value: int32 };
    function make(value: int32) { return { value, extra: true }; }
    export function nativeFactory(): (value: int32) => Product { return make; }
    export function retain(factory: (value: int32) => Product): (value: int32) => View { return factory; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const returns = [];
  const visit = node => {
    if (ast.is.IsReturnStatement(node)) {
      const expression = ast.as.AsReturnStatement(node).Expression;
      if (expression !== undefined && ast.is.IsIdentifier(expression) && ast.text(expression) === "factory") returns.push(expression);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(returns.length, 1, "the source has one actual native variant return use");
  const use = program.records.nativeExpression.get(returns[0])?.use;
  assert.equal(use?.kind === "converted" && use.input.kind === "value", true,
    "the exact consumed callable source and destination are retained");
  const selected = program.records.expressionConversion.get(returns[0], use.input.type, use.target, use.mode);
  assert.equal(selected?.kind === "implicit" && selected.proof === "reference", true,
    "the selected native relation has no adapter, captures, boxing or copy");
  executeCsharpConstruction(compiled, `native-delegate-variance-${surface}`, false, false, [], `
    var original = Tsonic.Generated.Index.nativeFactory();
    var widened = Tsonic.Generated.Index.retain(original);
    if (!System.Object.ReferenceEquals(original, widened) || widened(7).value != 7)
      throw new System.Exception("native variance keeps delegate identity and invocation");
    for (int index = 0; index < 20000; index++)
      if (!System.Object.ReferenceEquals(original, Tsonic.Generated.Index.retain(original)))
        throw new System.Exception("native variance warmup identity");
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    bool same = true;
    for (int index = 0; index < 20000; index++)
      same &= System.Object.ReferenceEquals(original, Tsonic.Generated.Index.retain(original));
    long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (!same || allocated != 0) throw new System.Exception("native variance must allocate zero adapter bytes");
  `);
});

test("tagged template operands have finite contexts without changing the retained source refusal", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function tag(parts: TemplateStringsArray, value: number): string { return parts[0]; }
    export function run(value: number): string { return tag\`value=\${value}\`; }`, surface: "js" });
  assert.equal(compiled.sourceDiagnosticsText === "", true, "the tagged-template control is source-valid");
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length === 1 && errors[0].code === "CSHARP_UNSUPPORTED_AST" &&
    errors[0].message === "Expression is outside the current C# planning surface.", true,
    "the unsupported tagged renderer keeps its exact source refusal, never an emission-context invariant");
});

test("transparent wrappers of discarded callable creation remain erased without a fabricated completion", () => {
  const compiled = compileCsharpSource({ sourceText: `export function run(): number {
    (() => 1);
    ((() => 2));
    (() => 3) satisfies (() => number);
    return 4;
  }` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.result.diagnostics.length === 0, true,
    "every discarded creation keeps its pre-existing valid source admission");
  const program = compiled.result.program;
  const wrappers = [];
  const visit = node => {
    if (program.source.ast.is.IsExpressionStatement(node)) wrappers.push(program.source.ast.as.AsExpressionStatement(node).Expression);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(wrappers.length, 3, "all three authored creation effects are represented");
  for (const wrapper of wrappers) assert.equal(program.records.nativeExpression.get(wrapper)?.use.kind === "erased", true,
    "a transparent wrapper inherits only its actual discarded child, never a pending source failure");
});

test("native void completion preserves effectful absent calls and the selected conditional branch", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    let calls = 0;
    function absent(): undefined { calls++; return undefined; }
    function condition(): boolean { calls++; return true; }
    function call(): void { return (absent()); }
    function branch(): void { return condition() ? absent() : absent(); }
    export function run(): boolean { call(); branch(); return calls === 3; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `native void effect control: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ message }) => message).join("; ")}`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  const voidBodies = output.match(/public static void (?:call|branch)\(\)[\s\S]*?\n        \}/gu) ?? [];
  assert.equal(voidBodies.length, 2, "both native void methods reach emission");
  assert.equal(voidBodies.some(body => /return null/u.test(body)) || /default\(void\)|_ = null/u.test(output), false,
    "the native completion never fabricates a void value or a null effect");
  executeCsharpConstruction(compiled, "native-void-absent-effect-order");
});

function owners(sourceText, surface = "js") {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of csharpProgramSourceFiles(program)) walk(file);
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, semanticsFor: source.semantics.forNode, sourceFiles: csharpProgramSourceFiles(program), participation: records.nativeParticipation,
    evidence: records, operations: records, valueReads: records, objectShapes: program.objectShapes, storage: records,
    initializerUses: { get: declaration => {
      const expression = ast.as.AsVariableDeclaration(declaration)?.Initializer;
      return expression === undefined ? undefined : records.nativeExpression.get(expression)?.physical;
    } },
    typePolicy: { resolveType: () => assert.fail("These native-use closure fixtures require no source-owned member resolution.") },
    conversionPolicy: { target: compiled.target, typeDefinitions: program.typeDefinitions, objectShapes: program.objectShapes,
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
      projectTypes: { directSupertypes: type => {
        const heritage = program.projectTypes.heritageForTarget(type);
        return heritage === undefined ? undefined : heritage.baseType === undefined
          ? heritage.interfaces : [heritage.baseType, ...heritage.interfaces];
      } } } });
  const input = { ast, sourceFiles: csharpProgramSourceFiles(program), navigation: program.sourceNavigation, evidence: records, operations: records,
    nativeExpressionIssues: [],
    declarations: records, objectShapes: program.objectShapes,
    exactLiteral: records.exactLiteral, propertyKeyBindings: expression => {
      const use = records.nativeExpression.get(expression)?.use;
      return use === undefined || use.kind === "erased" ? undefined : use.propertyKeys;
    },
    valueReads: records, participation: records.nativeParticipation, bindingPatterns, callableCreation: { get: () => undefined },
    attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  const variable = name => nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  return { ast, nodes, records, input, text, variable };
}

test("every admitted native edge resolves to the one exact immutable publication", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 { return identity(value) + 1; }`, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => entry.reason).join("; "));
  assert.equal(demand.entries.length > 3, true, "nonvacuous closure");
  const keys = new Map();
  for (const entry of demand.entries) {
    const identities = keys.get(entry.site.subject) ?? new Set();
    assert.equal(identities.has(targetUseSiteIdentity(entry.site)), false, "one write per native use");
    identities.add(targetUseSiteIdentity(entry.site)); keys.set(entry.site.subject, identities);
    assert.equal(demand.nativeUse.get(entry.site) === entry.use, true, "lookup is the published object");
    if (entry.use.kind === "erased") continue;
    for (const child of entry.use.children) assert.equal(demand.nativeUse.get(child) !== undefined, true, `closed child ${child.role}`);
  }
});

test("an alternative never does not erase the other branch or a callable creation", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); }
    export function choose(flag: boolean): number { return flag ? fail() : 3; }
    export const callback: () => never = () => fail();`);
  const arrow = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  const carrier = value.records.valueRead.get(arrow)?.value;
  assert.equal(carrier !== undefined, true, "native-use-closure:58: carrier !== undefined");
  const demand = analyzeCsharpNativeDemand({ ...value.input, callableCreation: { get: node => node === arrow ? { kind: "selected", carrier } : undefined } }, []);
  const conditional = demand.entries.find(entry => entry.use.kind !== "erased" && entry.use.evaluation.kind === "conditional");
  assert.equal(conditional !== undefined && conditional.use.completion.kind === "value", true, "native-use-closure:61: conditional !== undefined && conditional.use.completion.kind === \"value\"");
  const creation = demand.entries.find(entry => entry.use.expression === arrow);
  assert.equal(creation !== undefined && creation.use.kind !== "erased" && creation.use.evaluation.kind === "creation" &&
    creation.use.completion.kind === "value" && creation.use.children.length === 0, true, "native-use-closure:64: creation !== undefined && creation.use.kind !== \"erased\" && creation.use.evaluation.kind =");
  assert.equal(demand.nativeUse.order(arrow)?.length > 0, true, "the body is still in compilation order");
});

test("a physical collection carrier survives a never completion before its outer conversion", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); } export const result: number[] = [fail()];`);
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const carrier = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("float64") });
  const target = csharpObjectTargetType();
  const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target });
  const stage = csharpNativeUseSite(expression, { kind: "constructed-result" }, { target });
  const use = Object.freeze({ expression, carrier, target, strength: "required", exactInteger: false, mode: "implicit", representation: "convert",
    children: Object.freeze([stage]), construction: Object.freeze({ site: stage, carrier, children: Object.freeze([]) }) });
  const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
    request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
  const constructed = demand.nativeUse.get(stage);
  const converted = demand.nativeUse.get(site);
  assert.equal(constructed?.kind === "constructed" && constructed.carrier === carrier && constructed.completion.kind === "never", true, "native-use-closure:83: constructed?.kind === \"constructed\" && constructed.carrier === carrier && constructed.comp");
  assert.equal(converted?.kind === "converted" && converted.carrier === carrier && converted.target === target && converted.completion.kind === "never", true, "native-use-closure:84: converted?.kind === \"converted\" && converted.carrier === carrier && converted.target === t");
});

test("different finalized contexts and pending data remain private, not a first-target fallback", () => {
  const value = owners("export const result = 1;", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const entries = ["int32", "float64"].map(name => {
    const target = csharpSourcePrimitiveTargetType(name);
    return { site: csharpNativeUseSite(declaration, { kind: "initializer" }, { target }), use: {
      expression, carrier: target, target, strength: "required", exactInteger: false, mode: "implicit", representation: "construct", children: [] } };
  });
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected: { entries, pending: [], inactive: [], expectedUse: { get: () => undefined } } }, []);
  assert.equal(demand.entries.some(entry => entry.use.expression === expression), false, "neither target is silently selected");
  assert.equal(demand.unadmitted.some(entry => entry.expression === expression && entry.reason === "use-context-unresolved"), true, "native-use-closure:98: demand.unadmitted.some(entry => entry.expression === expression && entry.reason === \"use-c");
});

test("actual native key refusals precede expected-slot pending and retain every original diagnostic", () => {
  const value = owners("export const result = { first: 1, second: 2 };", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const names = value.ast.properties(expression).map(property => value.ast.name(property));
  assert.equal(names.length === 2 && names.every(name => name !== undefined), true, "two actual checked property identities");
  const issues = names.map((sourceNode, index) => Object.freeze({ category: "error", source: "tsonic-csharp",
    code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN", sourceNode, message: `Exact selected key refusal ${index}.`, requiredBy: [expression] }));
  const site = csharpNativeUseSite(declaration, { kind: "initializer" });
  const demand = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: issues,
    expected: { ...value.input.expected, pending: [{ site, expression, reason: "inconsistent-request" }] } }, []);
  assert.equal(demand.unadmitted.length, 2, "both selected key refusals replace pending at the actual use root");
  assert.equal(demand.unadmitted.every((entry, index) => entry.kind === "source-refusal" && entry.requiredBy === expression &&
    entry.diagnostic === issues[index]), true, "the original diagnostic and actual required expression keep separate identities");
  assert.equal(demand.nativeUse.expression(expression) === undefined, true, "a refused expression never receives a fabricated native use");
});

for (const surface of ["native", "js"]) test(`${surface} actual ambient admission precedes pending slots without observing an erased body`, () => {
  const value = owners(`
declare const external: number;
export function run(): number {
  function hidden(): number { return external; }
  return 42;
}`, surface);
  const hidden = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "hidden");
  const reference = value.nodes.find(node => value.ast.is.IsIdentifier(node) && value.ast.text(node) === "external" &&
    value.ast.is.IsReturnStatement(value.ast.parent(node)));
  assert.equal(hidden !== undefined && reference !== undefined && value.records.nativeParticipation.get(hidden) === "erased", true,
    "the real canonical producer erases the exact original dormant body and retains its checked reference");
  const dormant = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(dormant.unadmitted.length === 0 && dormant.nativeUse.expression(reference) === undefined, true,
    "native demand does not invent an implementation obligation for an erased body");
  const site = csharpNativeUseSite(value.ast.parent(reference), { kind: "return" });
  const demand = analyzeCsharpNativeDemand({ ...value.input,
    participation: { get: node => node === hidden ? "body" : value.input.participation.get(node) },
    expected: { ...value.input.expected, pending: [{ site, expression: reference, reason: "inconsistent-request" }] },
  }, []);
  const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
  const refusal = refusals[0];
  assert.equal(refusals.length === 1 && refusal.requiredBy === reference && refusal.diagnostic.sourceNode === reference &&
    refusal.diagnostic.code === "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING" &&
    refusal.diagnostic.message === "A runtime read of an authored ambient variable requires an exact native implementation.", true,
  "the same actual runtime reference reports its original source refusal before an expected-slot pending or missing-fact invariant");
  assert.equal(demand.unadmitted.some(entry => entry.kind === "pending-use" && entry.expression === reference), false,
    "the precise implementation refusal is not replaced by pending carrier evidence");
  assert.equal(demand.nativeUse.expression(reference) === undefined, true,
    "refused actual use cannot publish an invented native binding or expression");
});

for (const [label, body, expression, family] of [
  ["call", "function make(): number { return 1; } export const result = make();", "make()", "selectedCall"],
  ["construction", "class Box { value = 1; } export const result = new Box();", "new Box()", "selectedConstruction"],
  ["property", "const box = { value: 1 }; export const result = box.value;", "box.value", "selectedProperty"],
  ["element", "const values = [1]; export const result = values[0];", "values[0]", "selectedElement"],
]) test(`a selected ${label} refusal reaches analysis with its canonical code, node, reason and complete evidence`, () => {
  const value = owners(body, "native");
  const node = value.nodes.find(candidate => value.text(candidate) === expression &&
    value.input.operations[family].get(candidate) !== undefined);
  assert.equal(node !== undefined, true, `${label}: the real operation owner publishes its selected boundary`);
  const original = value.input.operations[family].get(node);
  for (const publicCode of ["DO_NOT_SUBSTITUTE_PUBLIC_CODE", undefined]) {
    const diagnostic = Object.freeze({ extensionId: "test-source-policy", extensionCode: "EXACT_NATIVE_RELATION",
      ...(publicCode === undefined ? {} : { publicCode }), numericCode: 9101001, category: "error",
      nodeOrSpan: node, message: `Selected ${label} native relation is not closed.`, evidence: Object.freeze([
        Object.freeze({ message: "The selected physical carrier is exact." }),
        Object.freeze({ message: "Its required native relation is absent." }),
        Object.freeze({ message: "The selected physical carrier is exact." }),
      ]) });
    const target = Object.freeze({ kind: "rejected", diagnostic });
    const selected = label === "property" ? { ...original, selection: target }
      : { ...original, target };
    const operations = { ...value.input.operations, [family]: { get: candidate => candidate === node
      ? selected : value.input.operations[family].get(candidate) } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, operations }, []);
    const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
    const refusal = refusals[0];
    assert.equal(refusals.length === 1 && refusal.requiredBy === node && refusal.diagnostic.sourceNode === node &&
      refusal.diagnostic.code === (publicCode ?? "TS9101001") && refusal.diagnostic.category === diagnostic.category &&
      refusal.diagnostic.source === diagnostic.extensionId && refusal.diagnostic.message === diagnostic.message, true,
    `${label}: the canonical mapper preserves an explicit public code or the exact numeric fallback, selected node, category, owner and reason`);
    assert.equal(refusal.diagnostic.evidence?.length === 2 &&
      refusal.diagnostic.evidence[0] === diagnostic.evidence[0].message &&
      refusal.diagnostic.evidence[1] === diagnostic.evidence[1].message && Object.isFrozen(refusal.diagnostic.evidence), true,
    `${label}: all distinct evidence survives once, in its original order`);
    assert.equal(demand.nativeUse.expression(node) === undefined, true,
      `${label}: a refused operation is never published as an accepted native use`);
  }
});

test("an actual selected empty construct differs from an erased construct for native key requirements", () => {
  const value = owners("export function accept(): void {}", "native");
  const declaration = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node));
  const sourceNode = value.ast.name(declaration);
  const issue = Object.freeze({ category: "error", source: "tsonic-csharp", code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    sourceNode, message: "Exact selected native signature key refusal.", requiredBy: [declaration] });
  const selected = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue] }, []);
  assert.equal(selected.unadmitted.length === 1 && selected.unadmitted[0].kind === "source-refusal" &&
    selected.unadmitted[0].requiredBy === declaration && selected.unadmitted[0].diagnostic === issue, true,
  "a valid empty native signature still admits its exact key requirements");
  const erased = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue],
    participation: { get: node => node === declaration ? "erased" : value.input.participation.get(node) } }, []);
  assert.equal(erased.unadmitted.length, 0, "the same owner-selected erasure has no native key obligation");
  assert.equal(erased.nativeUse.order(declaration)?.length, 0, "erasure keeps the established empty native order");
});

for (const [name, type, expression] of [["integer", "int32", "-2"], ["negative-zero", "float32", "-0"]]) {
  test(`a finalized ${name} literal is one native construction without its source spelling operand`, () => {
    const value = owners(`import type { ${type} } from "@tsonic/core/types.js"; export const result: ${type} = ${expression};`, "native");
    const declaration = value.variable("result");
    const initializer = value.ast.as.AsVariableDeclaration(declaration).Initializer;
    const carrier = csharpSourcePrimitiveTargetType(type);
    const literal = value.records.exactLiteral.get(initializer, carrier);
    assert.equal(literal?.kind === "resolved", true, "the real literal producer admits the authored token");
    const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target: carrier });
    const use = Object.freeze({ expression: initializer, carrier, target: carrier, strength: "required", exactInteger: false,
      mode: "implicit", representation: "construct", children: Object.freeze([]), literal: literal.recipe });
    const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
      request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
    const selected = demand.nativeUse.get(site);
    assert.equal(selected?.kind === "constructed" && selected.carrier === carrier && selected.completion.kind === "value", true,
      "one exact native literal carrier and completing construction");
    assert.equal(selected.children.length, 0, "literal token spelling does not create a runtime operand");
    assert.equal(demand.entries.some(entry => entry.site.subject === initializer && entry.site.role === "operand:only"), false,
      "no source-unary operand is admitted for the finalized literal");
    assert.equal(demand.requiredBindingRoots.includes(declaration), true, "the completing initializer requires its binding root");
  });
}

test("binding requirements follow actual completion and retain signature parameters", () => {
  const value = owners(`
    function fail(): never { throw new Error("stop"); }
    export interface Contract { accept([value]: [number]): number; }
    function make(value: number): [number] { return [value]; }
    export function run(): number { const [value] = make(fail()); return value; }
  `);
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const stopped = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(stopped !== undefined, true, "one destructuring declaration");
  assert.equal(demand.requiredBindingRoots.includes(stopped), false, "a never-completing initializer needs no projection payload");
  const parameter = value.nodes.find(node => value.ast.is.IsParameterDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(parameter !== undefined, true, "one signature parameter");
  assert.equal(demand.requiredBindingRoots.includes(parameter), true, "a retained signature keeps its parameter projection requirement");
  assert.equal(Object.isFrozen(demand.requiredBindingRoots), true, "required-root publication is immutable");
});

test("the canonical native binding domain includes actual local declarations and selects catch bindings once", () => {
  const value = owners(`
    export function initializerless<T>(value: T): T {
      let T: T | undefined;
      if (T === undefined) return value;
      return T;
    }
    export function named<T>(value: T): T {
      function T(other: T): T { return other; }
      return T(value);
    }
    export function used<T>(value: T): T {
      try { return value; }
      catch (T) { if (T instanceof Error) return value; throw T; }
    }
    export function rethrown<T>(value: T): T { try { return value; } catch (T) { throw T; } }
    export function unused<T>(value: T): T { try { return value; } catch (T) { return value; } }
  `, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const initializerless = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsVariableDeclarationList(value.ast.parent(node)) && value.ast.text(value.ast.name(node)) === "T");
  const localFunction = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) &&
    value.ast.text(value.ast.name(node)) === "T");
  assert.equal(initializerless !== undefined && demand.requiredBindingRoots.includes(initializerless), true,
    "an actual initializer-less native local has a binding even without an initializer use");
  assert.equal(localFunction !== undefined && value.records.nativeParticipation.get(localFunction) === "body" &&
    demand.requiredBindingRoots.includes(localFunction), true,
  "a native local function's existing body participation owns its emitted value name");
  const clauses = value.nodes.filter(node => value.ast.is.IsCatchClause(node));
  assert.equal(clauses.length, 3, "all original used, rethrow-only and unused catch clauses are present");
  for (const [index, clause] of clauses.entries()) {
    const declaration = value.ast.as.AsCatchClause(clause).VariableDeclaration;
    const order = demand.nativeUse.order(clause);
    assert.equal(declaration !== undefined && order !== undefined, true, "the actual checked clause and its order are published");
    const required = index === 0;
    assert.equal(demand.requiredBindingRoots.includes(declaration), required,
      `${index}: only an actual source value use retains the authored catch binding`);
    assert.equal(order.some(step => step.kind === "construct" && step.construct === declaration), required,
      `${index}: the data-only backend consumes the same canonical catch selection`);
    assert.equal(demand.nativeUse.order(declaration) !== undefined, required,
      `${index}: an omitted binding has no separate native construct to be reselected`);
  }
});
