import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const destinationBodies = {
  Alias: (element, name) => `type ${name}Values = ${element}[];
    export function ${name}(narrow: float32, signed: int32): ${name}Values {
      const values: ${name}Values = [narrow, signed]; return values; }`,
  Argument: (element, name) => `function ${name}Accept(values: ${element}[]): ${element}[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept(values); }`,
  Return: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const values = [narrow, signed]; const alias = values; return alias; }`,
  Async: (element, name) => `export async function ${name}(narrow: float32, signed: int32): Promise<${element}[]> {
    const values = [narrow, signed]; return values; }`,
  Concise: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make = (): ${element}[] => [narrow, signed]; return make(); }`,
  Nested: (element, name) => `function ${name}Call(make: () => ${element}[]): ${element}[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call(() => { const values = [narrow, signed]; return values; }); }`,
  GenericArgument: (element, name) => `function ${name}Accept<T>(values: T[]): T[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept<${element}>(values); }`,
  GenericCallback: (element, name) => `function ${name}Call<T>(make: () => T[]): T[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call<${element}>(() => { const values = [narrow, signed]; return values; }); }`,
  Receiver: (element, name) => `class ${name}Receiver<T> { accept(values: T[]): T[] { return values; } }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const receiver = new ${name}Receiver<${element}>(); const values = [narrow, signed]; return receiver.accept(values); }`,
  TypedCallback: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make: () => ${element}[] = () => { const values = [narrow, signed]; return values; }; return make(); }`,
};
const destinationPrograms = Object.entries(destinationBodies).flatMap(([context, body]) =>
  [["Single", "float32", "float"], ["Double", "number", "double"]].map(([suffix, element, native]) => ({
    context, name: `destination${context}${suffix}`, native,
    source: body(element, `destination${context}${suffix}`),
  })));
const unionDestinationPrograms = Object.entries(destinationBodies).map(([context, body]) => ({
  context, name: `unionDestination${context}`,
  source: body("(string | number)", `unionDestination${context}`).replaceAll("[narrow, signed]",
    '["text", 9007199254740993, -9007199254740993, 1e100]'),
}));
unionDestinationPrograms.push(
  { context: "NestedGenericArgument", name: "unionNestedGenericArgument", source: `
    function unionNestedAccept<T>(values: (string | T)[]): (string | T)[] { return values; }
    export function unionNestedGenericArgument(narrow: float32, signed: int32): (string | number)[] {
      const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return unionNestedAccept<number>(values); }` },
  { context: "NestedGenericCallback", name: "unionNestedGenericCallback", source: `
    function unionNestedCall<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
    export function unionNestedGenericCallback(narrow: float32, signed: int32): (string | number)[] {
      return unionNestedCall<number>(() => { const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return values; }); }` },
  { context: "NestedGenericReceiver", name: "unionNestedGenericReceiver", source: `
    class UnionNestedReceiver<T> { accept(values: (string | T)[]): (string | T)[] { return values; } }
    export function unionNestedGenericReceiver(narrow: float32, signed: int32): (string | number)[] {
      const receiver = new UnionNestedReceiver<number>();
      const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return receiver.accept(values); }` },
);

const sourceText = `
import type { float32, float64, int16, uint16, int32, uint32, int64, decimal as nativeDecimal } from "@tsonic/core/types.js";
export function bare(signed: int32, unsigned: uint32) { const bareValues = [signed, unsigned]; return bareValues; }
export function reverse(signed: int32, unsigned: uint32) { const reverseValues = [unsigned, signed]; return reverseValues; }
export function left(signed: int32, unsigned: uint32) { const leftValues = [signed, unsigned, 1]; return leftValues; }
export function middle(signed: int32, unsigned: uint32) { const middleValues = [signed, 1, unsigned]; return middleValues; }
export function right(signed: int32, unsigned: uint32) { const rightValues = [1, signed, unsigned]; return rightValues; }
export function wrapped(signed: int32, unsigned: uint32) { const wrappedValues = [signed, unsigned, ((1))]; return wrappedValues; }
export function reads(signed: int32, unsigned: uint32): boolean {
  const first = bare(signed, unsigned); const second = reverse(signed, unsigned);
  const a = left(signed, unsigned); const b = middle(signed, unsigned); const c = right(signed, unsigned);
  return first[0] === signed && first[1] === unsigned && second[0] === unsigned && second[1] === signed &&
    a[0] === signed && a[1] === unsigned && a[2] === 1 && b[0] === signed && b[1] === 1 && b[2] === unsigned &&
    c[0] === 1 && c[1] === signed && c[2] === unsigned;
}
export function same(signed: int32, unsigned: uint32): boolean {
  const values = left(signed, unsigned);
  return values[0] === values[1] && values[0] === values[2] && values[1] === values[2] && !(values[0] !== values[1]);
}
export function half(narrow: float32) { return [narrow, 0.5]; }
export function decimal(narrow: float32) { return [narrow, 0.1]; }
export function small(narrow: float32, signed: int16, unsigned: uint16) { return [narrow, signed, unsigned]; }
export function explicitDouble(narrow: float32, signed: int32): number[] { return [narrow, signed]; }
export function explicitSingle(narrow: float32, signed: int32): float32[] { return [narrow, signed]; }
export function wide() { const value: int64 = 9007199254740993n; return [value, value]; }
export function fittingWide() { const value: int64 = 9007199254740993n; return [value, 1, 9007199254740993]; }
export function integerPastSingle(narrow: float32) { return [narrow, 16777217]; }
export function exactHuge(signed: int32, unsigned: uint32) {
  const hugeValues = [signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376]; return hugeValues;
}
export function explicitRounded(signed: int32): number[] { return [signed, 9007199254740993]; }
export function genuineFloatWide(narrow: float32, wide: int64) {
  const floatWideValues = [narrow, wide]; return floatWideValues;
}
export function explicitUnionWide(wide: int64): (string | int64)[] {
  const exactUnionValues: (string | int64)[] = ["text", wide, 9007199254740993]; return exactUnionValues;
}
export function explicitUnionDecimal(): (string | nativeDecimal)[] {
  const decimalUnionValues: (string | nativeDecimal)[] = ["text", 9007199254740993]; return decimalUnionValues;
}
export function explicitUnionSingle(): (string | float32)[] {
  const singleUnionValues: (string | float32)[] = ["text", 16777217]; return singleUnionValues;
}
export function explicitOptionalDouble(): (number | undefined)[] {
  const optionalUnionValues: (number | undefined)[] = [undefined, 9007199254740993]; return optionalUnionValues;
}
export function explicitWideFloatUnion(wide: int64, computed: number): (int64 | number)[] {
  const wideFloatUnionValues: (int64 | number)[] = [wide, computed]; return wideFloatUnionValues;
}
export function inferredHeterogeneous(computed: number) {
  const inferredHeterogeneousValues = ["text", computed, 9007199254740994, 0.1, -0]; return inferredHeterogeneousValues;
}
let trace: int32 = 0;
function signedEffect(): int32 { trace = trace * 10 + 1; return -1; }
function unsignedEffect(): uint32 { trace = trace * 10 + 2; return 4294967295; }
function fractionEffect(): float64 { trace = trace * 10 + 3; return 0.5; }
export function effects(): boolean {
  trace = 0; const values = [signedEffect(), unsignedEffect(), fractionEffect()];
  return trace === 123 && values[0] === -1 && values[1] === 4294967295 && values[2] === 0.5;
}
` + destinationPrograms.map(program => program.source).join("\n") + "\n" +
  unionDestinationPrograms.map(program => program.source).join("\n");

function carriers(program) {
  const result = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) result.set(ast.text(ast.name(node)),
        getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return result;
}

function nativeArrayElements(program) {
  const named = new Map();
  const unionDestinations = [];
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsArrayLiteralExpression(node)) {
      const use = program.records.nativeUse.expression(node)?.use;
      assert.equal(use?.kind === "constructed", true, "every native array has one admitted physical construction");
      const element = getCsharpArrayLiteralElementTargetType(use.carrier);
      if (ast.elements(node).length === 4 && ast.is.IsStringLiteral(ast.elements(node)[0])) unionDestinations.push(element);
      const parent = ast.parent(node);
      if (parent !== undefined && ast.is.IsVariableDeclaration(parent)) named.set(ast.text(ast.name(parent)), element);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return { named, unionDestinations };
}

for (const surface of ["native", "js"]) test(`${surface} inferred numeric arrays preserve values, physical arms, rounding boundaries and native costs`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const selected = carriers(compiled.result.program);
    const arms = name => {
      const result = getCsharpRuntimeUnionArms(selected.get(name), compiled.result.program.typeDefinitions);
      assert.equal(result !== undefined && result.every(arm => arm.kind === "source-primitive" &&
        ["int32", "uint32", "float64"].includes(arm.name)), true, `${name}: exact native primitive physical arms`);
      return result;
    };
    const types = { int32: "int", uint32: "uint", float64: "double" };
    const methods = [
      ["bare", "bareValues", ["int32", "uint32"]],
      ["reverse", "reverseValues", ["uint32", "int32"]],
      ["left", "leftValues", ["int32", "uint32", "float64"]],
      ["middle", "middleValues", ["int32", "float64", "uint32"]],
      ["right", "rightValues", ["float64", "int32", "uint32"]],
      ["wrapped", "wrappedValues", ["int32", "uint32", "float64"]],
      ["exactHuge", "hugeValues", ["int32", "uint32", "float64"], "System.Math.ScaleB(1D, 200)"],
    ].map(([method, name, values, literal = "1D"]) => {
      const members = arms(name);
      assert.equal(members.length === values.length && new Set(members.map(arm => arm.name)).size === values.length, true,
        `${name}: the actual constructor uses the required complete physical union`);
      const union = `Tsonic.CSharp.Runtime.Union<${members.map(arm => types[arm.name]).join(", ")}>`;
      const entries = values.map(kind => `${union}.From${members.findIndex(arm => arm.name === kind) + 1}(${kind === "int32" ? "signed" : kind === "uint32" ? "unsigned" : literal})`);
      const storage = surface === "native" ? `${union}[]` : `Tsonic.CSharp.Js.JSArray<${union}>`;
      const construction = surface === "native" ? `new ${union}[] { ${entries.join(", ")} }`
        : `Tsonic.CSharp.Js.JSArray<${union}>.of([${entries.join(", ")}])`;
      const reads = values.map((kind, index) => `!${method}[${index}].Is${members.findIndex(arm => arm.name === kind) + 1}() ||
        ${method}[${index}].As${members.findIndex(arm => arm.name === kind) + 1}() != ${kind === "int32" ? "-1" : kind === "uint32" ? "4294967295U" : literal}`).join(" || ");
      return { method, baseline: `static ${storage} Baseline_${method}(int signed, uint unsigned) => ${construction};`,
        read: `var ${method} = Subject.${method}(-1, 4294967295U); if (${reads}) throw new System.Exception("${method}: exact physical contribution");` };
    });
    const destinations = destinationPrograms.map(({ context, name, native }) => {
      const storage = surface === "native" ? `${native}[]` : `Tsonic.CSharp.Js.JSArray<${native}>`;
      const construction = surface === "native" ? `new ${native}[] { narrow, (${native})signed }`
        : `Tsonic.CSharp.Js.JSArray<${native}>.of([narrow, (${native})signed])`;
      const asynchronous = context === "Async";
      return { name, context,
        baseline: `static ${asynchronous ? `System.Threading.Tasks.Task<${storage}>` : storage} Baseline_${name}(float narrow, int signed) =>
          ${asynchronous ? `System.Threading.Tasks.Task.FromResult(${construction})` : construction};`,
        read: `var ${name} = Subject.${name}(1.5F, 16777217)${asynchronous ? ".GetAwaiter().GetResult()" : ""};
          if (${name}[0] != 1.5${native === "float" ? "F" : "D"} || ${name}[1] != ${native === "float" ? "16777216F" : "16777217D"})
            throw new System.Exception("${name}: the actual destination did not govern native element storage");`,
      };
    });
    const destinationCosts = destinations.filter(destination => ["Alias", "Argument", "Return"].includes(destination.context));
    const floatWide = getCsharpRuntimeUnionArms(selected.get("floatWideValues"), compiled.result.program.typeDefinitions);
    assert.equal(floatWide?.length === 2 && ["float32", "int64"].every(kind => floatWide.some(arm => arm.name === kind)), true,
      "a genuine fixed float/wide union retains both exact native representations");
    const floatArm = floatWide.findIndex(arm => arm.name === "float32") + 1;
    const wideArm = floatWide.findIndex(arm => arm.name === "int64") + 1;
    const nativeElements = nativeArrayElements(compiled.result.program);
    assert.equal(nativeElements.unionDestinations.length, unionDestinationPrograms.length,
      "all ten actual contexts and all three nested generic union bindings have native construction evidence");
    const unionArms = nativeElements.unionDestinations.map(element => {
      const arms = getCsharpRuntimeUnionArms(element, compiled.result.program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "float64") &&
        arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
      "an actual authored heterogeneous destination retains its exact native string and double arms");
      return arms;
    });
    const unionDestinations = unionDestinationPrograms.map(({ context, name }, index) => {
      const arms = unionArms[index];
      const text = arms.findIndex(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)) + 1;
      const floating = arms.findIndex(arm => arm.kind === "source-primitive" && arm.name === "float64") + 1;
      const union = `Tsonic.CSharp.Runtime.Union<${arms.map(arm => arm.kind === "source-primitive" ? "double" : "string").join(", ")}>`;
      const values = `${union}.From${text}("text"), ${union}.From${floating}(9007199254740993D),
        ${union}.From${floating}(-9007199254740993D), ${union}.From${floating}(1e100D)`;
      const storage = surface === "native" ? `${union}[]` : `Tsonic.CSharp.Js.JSArray<${union}>`;
      const construction = surface === "native" ? `new ${union}[] { ${values} }` : `Tsonic.CSharp.Js.JSArray<${union}>.of([${values}])`;
      return { name, context,
        baseline: `static ${storage} Baseline_${name}(float narrow, int signed) => ${construction};`,
        read: `var ${name} = Subject.${name}(1.5F, 16777217)${context === "Async" ? ".GetAwaiter().GetResult()" : ""};
          if (!${name}[0].Is${text}() || ${name}[0].As${text}() != "text" ||
              !${name}[1].Is${floating}() || ${name}[1].As${floating}() != 9007199254740992D ||
              !${name}[2].Is${floating}() || ${name}[2].As${floating}() != -9007199254740992D ||
              !${name}[3].Is${floating}() || ${name}[3].As${floating}() != 1e100D)
            throw new System.Exception("${name}: actual explicit native union destination or scalar rounding changed");`,
      };
    });
    const unionCosts = unionDestinations.filter(destination => ["Alias", "Argument", "Return"].includes(destination.context));
    const armOf = (name, scalar) => {
      const arms = getCsharpRuntimeUnionArms(nativeElements.named.get(name), compiled.result.program.typeDefinitions);
      const index = arms?.findIndex(arm => arm.kind === "source-primitive" && arm.name === scalar);
      assert.equal(index !== undefined && index >= 0, true, `${name}: actual ${scalar} native union payload`);
      return index + 1;
    };
    const exactLong = armOf("exactUnionValues", "int64");
    const exactDecimal = armOf("decimalUnionValues", "decimal");
    const roundedSingle = armOf("singleUnionValues", "float32");
    const mixedLong = armOf("wideFloatUnionValues", "int64");
    const mixedDouble = armOf("wideFloatUnionValues", "float64");
    const inferredDouble = armOf("inferredHeterogeneousValues", "float64");
    const nativeProgram = `
using Subject = Tsonic.Generated.Index;
${methods.map(method => method.baseline).join("\n")}
${destinationCosts.map(method => method.baseline).join("\n")}
${unionCosts.map(method => method.baseline).join("\n")}
${methods.map(method => method.read).join("\n")}
${destinations.map(method => method.read).join("\n")}
${unionDestinations.map(method => method.read).join("\n")}
if (!Subject.reads(-1, 4294967295U) || !Subject.same(1, 1) || Subject.same(-1, 4294967295U) || !Subject.effects())
    throw new System.Exception("source indexed reads, cross-arm equality or once-only order");
var half = Subject.half(-0F);
if (System.BitConverter.SingleToUInt32Bits(half[0]) != 0x80000000U || half[1] != 0.5F)
    throw new System.Exception("float32 signed zero or exact binary token");
var decimalValues = Subject.@decimal(1.5F);
if (System.BitConverter.DoubleToUInt64Bits(decimalValues[1]) != System.BitConverter.DoubleToUInt64Bits(0.1D))
    throw new System.Exception("the actual float64 fraction was rounded through float32");
var small = Subject.small(1.5F, short.MinValue, ushort.MaxValue);
if (small[0] != 1.5F || small[1] != short.MinValue || small[2] != ushort.MaxValue)
    throw new System.Exception("a narrow integer domain lost an exact native value");
var doubles = Subject.explicitDouble(1.5F, 16777217);
var singles = Subject.explicitSingle(1.5F, 16777217);
if (doubles[1] != 16777217D || singles[1] != (float)16777217 || Subject.wide()[0] != 9007199254740993L)
    throw new System.Exception("actual native destination or exact int64 contract changed");
var fittingWide = Subject.fittingWide();
if (fittingWide[0] != 9007199254740993L || fittingWide[1] != 1L || fittingWide[2] != 9007199254740993L ||
    Subject.integerPastSingle(1.5F)[1] != 16777217D || Subject.explicitRounded(1)[1] != 9007199254740992D)
    throw new System.Exception("exact authored native integers or an explicit native floating destination changed");
var floatWide = Subject.genuineFloatWide(0.5F, 9007199254740993L);
if (!floatWide[0].Is${floatArm}() || floatWide[0].As${floatArm}() != 0.5F ||
    !floatWide[1].Is${wideArm}() || floatWide[1].As${wideArm}() != 9007199254740993L)
    throw new System.Exception("a true checked native float/wide union was joined or rounded");
foreach (long value in new long[] { long.MinValue, 9007199254740993L, long.MaxValue }) {
    var exactUnion = Subject.explicitUnionWide(value);
    if (!exactUnion[1].Is${exactLong}() || exactUnion[1].As${exactLong}() != value ||
        !exactUnion[2].Is${exactLong}() || exactUnion[2].As${exactLong}() != 9007199254740993L)
        throw new System.Exception("an actual native integer union arm lost its full range or exact authored token");
    var mixedUnion = Subject.explicitWideFloatUnion(value, 0.1D);
    if (!mixedUnion[0].Is${mixedLong}() || mixedUnion[0].As${mixedLong}() != value ||
        !mixedUnion[1].Is${mixedDouble}() || mixedUnion[1].As${mixedDouble}() != 0.1D)
        throw new System.Exception("a genuine actual heterogeneous destination erased or rounded a native integer");
}
var decimalUnion = Subject.explicitUnionDecimal();
var singleUnion = Subject.explicitUnionSingle();
var optionalUnion = Subject.explicitOptionalDouble();
if (!decimalUnion[1].Is${exactDecimal}() || decimalUnion[1].As${exactDecimal}() != 9007199254740993M ||
    !singleUnion[1].Is${roundedSingle}() || singleUnion[1].As${roundedSingle}() != 16777216F ||
    optionalUnion[0].HasValue || !optionalUnion[1].HasValue || optionalUnion[1].GetValueOrDefault() != 9007199254740992D)
    throw new System.Exception("canonical explicit decimal, single or nullable native arm admission changed");
var inferredUnion = Subject.inferredHeterogeneous(0.5D);
if (inferredUnion[1].As${inferredDouble}() != 0.5D || inferredUnion[2].As${inferredDouble}() != 9007199254740994D ||
    inferredUnion[3].As${inferredDouble}() != 0.1D ||
    System.BitConverter.DoubleToUInt64Bits(inferredUnion[4].As${inferredDouble}()) != 0x8000000000000000UL)
    throw new System.Exception("exact inferred heterogeneous tokens, computed values or signed zero changed");
for (int index = 0; index < 512; index++) {
${methods.map(({ method }) => `System.GC.KeepAlive(Subject.${method}(-1, 4294967295U)); System.GC.KeepAlive(Baseline_${method}(-1, 4294967295U));`).join("\n")}
${destinationCosts.map(({ name }) => `System.GC.KeepAlive(Subject.${name}(1.5F, 16777217)); System.GC.KeepAlive(Baseline_${name}(1.5F, 16777217));`).join("\n")}
${unionCosts.map(({ name }) => `System.GC.KeepAlive(Subject.${name}(1.5F, 16777217)); System.GC.KeepAlive(Baseline_${name}(1.5F, 16777217));`).join("\n")}
}
${methods.map(({ method }) => `
long before_${method} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Subject.${method}(-1, 4294967295U));
long generated_${method} = System.GC.GetAllocatedBytesForCurrentThread() - before_${method};
before_${method} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Baseline_${method}(-1, 4294967295U));
long native_${method} = System.GC.GetAllocatedBytesForCurrentThread() - before_${method};
if (generated_${method} != native_${method}) throw new System.Exception($"${method}: native allocation mismatch {generated_${method}}/{native_${method}}");
System.Console.WriteLine($"${method}: generated={generated_${method}} native={native_${method}}");`).join("\n")}
${destinationCosts.map(({ name }) => `
long before_${name} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Subject.${name}(1.5F, 16777217));
long generated_${name} = System.GC.GetAllocatedBytesForCurrentThread() - before_${name};
before_${name} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Baseline_${name}(1.5F, 16777217));
long native_${name} = System.GC.GetAllocatedBytesForCurrentThread() - before_${name};
if (generated_${name} != native_${name}) throw new System.Exception($"${name}: native allocation mismatch {generated_${name}}/{native_${name}}");
System.Console.WriteLine($"${name}: generated={generated_${name}} native={native_${name}}");`).join("\n")}
${unionCosts.map(({ name }) => `
long before_${name} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Subject.${name}(1.5F, 16777217));
long generated_${name} = System.GC.GetAllocatedBytesForCurrentThread() - before_${name};
before_${name} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Baseline_${name}(1.5F, 16777217));
long native_${name} = System.GC.GetAllocatedBytesForCurrentThread() - before_${name};
if (generated_${name} != native_${name}) throw new System.Exception($"${name}: native allocation mismatch {generated_${name}}/{native_${name}}");
System.Console.WriteLine($"${name}: generated={generated_${name}} native={native_${name}}");`).join("\n")}
long counterBefore = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) { System.GC.KeepAlive(Baseline_bare(-1, 4294967295U)); System.GC.KeepAlive(new object()); }
long counterBytes = System.GC.GetAllocatedBytesForCurrentThread() - counterBefore;
if (counterBytes <= native_bare) throw new System.Exception("the native allocation counter did not detect a real extra object");
System.Console.WriteLine("numeric arrays: exact native values and costs");`;
    const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/${surface}/`, import.meta.url);
    mkdirSync(root, { recursive: true });
    writeFileSync(new URL("source-and-native.json", root), JSON.stringify({ sourceText, nativeProgram, artifacts: [...compiled.artifacts] }, null, 2));
    const output = executeCsharpConstruction(compiled, `C01-inferred-numeric-${surface}`, false, false, [], nativeProgram);
    writeFileSync(new URL("native-output.txt", root), output);
    assert.equal(output.trim().endsWith("numeric arrays: exact native values and costs"), true,
      "the actual generated program passed every native value, tag, sign, order and exact allocation control");
  });

const physicalForms = [
  ["bare", "[signed, unsigned]", 2],
  ["literalLast", "[signed, unsigned, 1]", 3],
  ["literalMiddle", "[signed, 1, unsigned]", 3],
  ["literalFirst", "[1, signed, unsigned]", 3],
];
const operationControls = [
  ["number read", "const value: number = values[0]; return value === 1;"],
  ["order", "return !(values[0] < values[1]);"],
  ["addition", "return values[0] + values[1] === 2;"],
  ["equality", "return values[0] === values[1] && !(values[0] !== values[1]);"],
  ["Object.is", "return Object.is(values[0], values[1]);"],
  ["Math.max", "return Math.max(values[0], values[1]) === 1;"],
  ["includes", "const first = [values[0]]; return first.includes(values[1]);"],
  ["indexOf", "return values.indexOf(values[1]) === 0;"],
  ["lastIndexOf", "return values.lastIndexOf(values[1]) === values.length - 1;"],
  ["Set", "const keys = new Set(values); return keys.has(values[1]) && keys.size === 1;"],
  ["Map", "const keys = new Map<number, boolean>(); keys.set(values[0], true); return keys.has(values[1]);"],
  ["String", 'return String(values[0]) === "1" && String(values[1]) === "1";'],
  ["template", 'return `${values[0]}:${values[1]}` === "1:1";'],
  ["JSON", "return JSON.stringify(values) === EXPECTED_JSON;"],
  ["sort", "values.sort(); return JSON.stringify(values) === EXPECTED_SORT;"],
];

function expectedOperationRefusals(operation, size) {
  const primitive = csharpSourcePrimitiveTargetType;
  const union = combineCsharpTargetUnionMembers([primitive("int32"), primitive("uint32"),
    ...(size === 3 ? [primitive("float64")] : [])]);
  const refused = (message, text, code = "CSHARP_UNSUPPORTED_AST") => ({ code, message, text });
  const conversion = (text, source = union, target = primitive("float64")) => refused(
    `No exact C# implicit conversion relates '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.`, text);
  switch (operation) {
    case "number read": return [conversion("values[0]")];
    case "order": return [refused("C# relational operator '<' requires numeric source-primitive operands or two exact string operands.",
      "values[0] < values[1]")];
    case "addition": return [refused("C# arithmetic operator '+' requires numeric source-primitive operands.",
      "values[0] + values[1]")];
    case "Math.max": return [conversion("values[0]"), conversion("values[1]")];
    case "includes": return [refused("Array.includes over a numeric union requires an exact native cross-arm key equality relation.",
      "first.includes(values[1])", "TS9101001")];
    case "indexOf": return [refused("Array.indexOf over a numeric union requires an exact native cross-arm key equality relation.",
      "values.indexOf(values[1])", "TS9101001")];
    case "lastIndexOf": return [refused("Array.lastIndexOf over a numeric union requires an exact native cross-arm key equality relation.",
      "values.lastIndexOf(values[1])", "TS9101001")];
    case "Set": return [conversion("values", csharpJsArrayTargetType(union), csharpEnumerableTargetType(primitive("float64"))),
      conversion("values[1]")];
    case "Map": return [conversion("values[0]"), conversion("values[1]")];
    case "equality": case "Object.is": case "String": case "template": case "JSON": case "sort": return [];
    default: throw new Error(`No declared C130 operation contract for ${operation}.`);
  }
}

for (const surface of ["native", "js"]) test(`${surface} a nested generic union argument compiles in its actual native array layout`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      function consume<T>(values: (string | T)[]): void {}
      export function run(): number {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; consume<number>(values); return 7;
      }` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `C01-selected-generic-array-layout-${surface}`, false, false, [], `
      if (Tsonic.Generated.Index.run() != 7D) throw new System.Exception("the actual generic array boundary did not compile and run");
      System.Console.WriteLine("selected generic array layout passed");`);
    assert.equal(output.includes("selected generic array layout passed"), true,
      "the original scalar, wide token and generic call reach a real native compiler without an array repair conversion");
  });

test("C130 js plain key relations and numeric-union join remain native", { timeout: 300_000 }, () => {
  const compiled = compileCsharpNativeUseSource({ surface: "js", sourceText: `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    export function check(): boolean {
      const numbers: number[] = [1, 2, 1]; const strings: string[] = ["a", "b", "a"];
      return numbers.includes(1) && numbers.indexOf(1) === 0 && numbers.lastIndexOf(1) === 2 &&
        strings.includes("a") && strings.indexOf("a") === 0 && strings.lastIndexOf("a") === 2;
    }
    export function join(signed: int32, unsigned: uint32): string {
      const values = [signed, unsigned]; return values.join(",");
    }` });
  assertCsharpCompilationSucceeded(compiled);
  const output = executeCsharpConstruction(compiled, "C130-proven-array-keys", false, false, [], `
    if (!Tsonic.Generated.Index.check() || Tsonic.Generated.Index.join(1, 1) != "1,1")
      throw new System.Exception("proven key relations or numeric-union join changed");
    System.Console.WriteLine("proven array key relations passed");`);
  assert.equal(output.includes("proven array key relations passed"), true,
    "the precise unsupported numeric-union key boundary does not cut ordinary keys or join");
});

for (const operation of ["includes", "indexOf", "lastIndexOf"]) test(`C130 js optional numeric-union ${operation} refuses the same unproven key relation`, () => {
  const compiled = compileCsharpNativeUseSource({ surface: "js", sourceText: `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    export function run(value: int32 | uint32 | undefined): boolean {
      const values = [value, value]; return ${operation === "includes" ? `values.${operation}(value)` : `values.${operation}(value) >= 0`};
    }` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const issue = compiled.nativeStage.diagnostics[0];
  const ast = compiled.nativeStage.source.ast;
  const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).trim();
  assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "TS9101001" &&
    issue.message === `Array.${operation} over a numeric union requires an exact native cross-arm key equality relation.` &&
    text === `values.${operation}(value)`, true, "one exact source refusal, including its native key relation and operation node");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "native absence cannot hide an unproven present-payload key operation or publish a partial program");
});

test("C130 js reports every winning numeric-union key refusal before program incompleteness", () => {
  const compiled = compileCsharpNativeUseSource({ surface: "js", sourceText: `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    export function run(signed: int32, unsigned: uint32): void {
      const values = [signed, unsigned];
      values.includes(signed); values.indexOf(unsigned); values.lastIndexOf(signed);
    }` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const expected = [
    ["includes", "values.includes(signed)"], ["indexOf", "values.indexOf(unsigned)"],
    ["lastIndexOf", "values.lastIndexOf(signed)"],
  ];
  const ast = compiled.nativeStage.source.ast;
  assert.equal(compiled.targetDiagnostics.length === expected.length, true,
    "all three actual selected boundaries report, rather than returning only the first policy group");
  for (const [operation, expression] of expected) {
    const issues = compiled.nativeStage.diagnostics.filter(issue => issue.message ===
      `Array.${operation} over a numeric union requires an exact native cross-arm key equality relation.`);
    const issue = issues[0];
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).trim();
    assert.equal(issues.length === 1 && issue.code === "TS9101001" && text === expression, true,
      `${operation}: one canonical diagnostic retains its exact selected reason and original operation node`);
  }
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "aggregate source refusals never escape as a missing-fact invariant or partial emitted program");
});

for (const surface of ["native", "js"]) for (const [formName, form, size] of physicalForms) for (const [operation, body] of operationControls) {
  if (surface === "native" && !["number read", "order", "addition", "equality", "template"].includes(operation)) continue;
  test(`C130 ${surface}: ${formName} ${operation} uses native number semantics or a precise pre-seal refusal`,
    { timeout: 300_000 }, () => {
      const expectedJson = size === 2 ? "[1,1]" : "[1,1,1]";
      const expectedSort = size === 2 ? "[10,2]" : "[1,10,2]";
      const sourceText = 'import type { int32, uint32 } from "@tsonic/core/types.js";\n' +
        `export function check(signed: int32, unsigned: uint32): boolean { const values = ${form}; ` +
        body.replace("EXPECTED_JSON", JSON.stringify(expectedJson)).replace("EXPECTED_SORT", JSON.stringify(expectedSort)) + " }";
      const compiled = compileCsharpNativeUseSource({ surface, sourceText });
      assert.equal(compiled.sourceDiagnosticsText === "", true, `${operation}: ${compiled.sourceDiagnosticsText}`);
      const errors = compiled.nativeStage.diagnostics.filter(issue => issue.category === "error");
      const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/operations/${surface}/${formName}/${operation.replace(/[^a-z]/giu, "-")}/`, import.meta.url);
      mkdirSync(root, { recursive: true });
      const diagnostic = issue => {
        const ast = compiled.nativeStage.source.ast;
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        const text = range?.kind !== "authored" ? undefined
          : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).trim();
        return { code: issue.code, message: issue.message, text };
      };
      writeFileSync(new URL("source-and-result.json", root), JSON.stringify({ sourceText,
        diagnostics: errors.map(diagnostic), artifacts: [...compiled.artifacts] }, null, 2));
      if (errors.length > 0) {
        assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
          "an unsupported cross-arm operation is refused before the seal and emits no artifact");
        const observed = errors.map(diagnostic).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const expected = expectedOperationRefusals(operation, size).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        assert.equal(observed.length === expected.length && observed.every((issue, index) =>
          issue.code === expected[index].code && issue.message === expected[index].message && issue.text === expected[index].text), true,
        `${formName}/${operation}: the complete exact code, native reason and authored source node match its declared operation contract`);
        process.stdout.write(`C130 ${surface} ${formName} ${operation}: PRESEAL ${errors.map(issue => issue.code).join(",")}\n`);
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      const nativeProgram = `if (!Tsonic.Generated.Index.check(${operation === "sort" ? "10, 2" : "1, 1"}))
        throw new System.Exception("C130 ${formName} ${operation}: cross-arm number semantics");
        System.Console.WriteLine("C130 native operation passed");`;
      writeFileSync(new URL("native-program.cs", root), nativeProgram);
      const output = executeCsharpConstruction(compiled, `C130-${surface}-${formName}-${operation.replace(/[^a-z]/giu, "-")}`, false, false, [], nativeProgram);
      writeFileSync(new URL("native-output.txt", root), output);
      assert.equal(output.includes("C130 native operation passed"), true, "the real generated native operation observes exact cross-arm number semantics");
      process.stdout.write(`C130 ${surface} ${formName} ${operation}: NATIVE\n`);
    });
}
