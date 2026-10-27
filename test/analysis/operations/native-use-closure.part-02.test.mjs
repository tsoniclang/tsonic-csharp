import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery, targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} numeric spread carriers are order-independent without erasing genuine native unions`,
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
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} a named interface property has no inferred physical native-field guarantee`,
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
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} actual structural callable returns retain every native-backed physical implementation`,
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
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} actual native delegate variance preserves identity and allocates no adapter`,
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
}

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
