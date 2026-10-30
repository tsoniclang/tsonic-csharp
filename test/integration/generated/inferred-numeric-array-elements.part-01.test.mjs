import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers, csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { destinationBodies, destinationPrograms, unionDestinationPrograms, sourceText, supportedSourceText, carriers, nativeArrayElements, physicalForms, operationControls, expectedOperationRefusals } from "./inferred-numeric-array-elements.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} inferred numeric arrays preserve values, physical arms, rounding boundaries and native costs`,
  { timeout: 300_000 }, () => {
    const original = compileCsharpNativeUseSource({ sourceText, surface });
    assert.equal(original.sourceDiagnosticsText, "");
    const ast = original.nativeStage.source.ast;
    const evidence = original.nativeStage.diagnostics.map(issue => {
      const range = ast.authoredRange(issue.sourceNode);
      const file = ast.getSourceFile(issue.sourceNode);
      return { code: issue.code, message: issue.message,
        text: range?.kind === "authored" ? ast.getSourceText(file).slice(range.start, range.end) : undefined,
        start: range?.kind === "authored" ? range.start : undefined };
    });
    const common = "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.";
    const expected = [
      { code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH", message: common, text: "[narrow, 16777217]" },
      { code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH", message:
        "An inferred numeric array literal is outside its declared or default native element range.",
      text: "[signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376]" },
      ...Array.from({ length: 6 }, () => ({ code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH", message: common, text: "[narrow, signed]" })),
    ];
    assert.deepEqual(evidence.map(({ code, message, text }) => ({ code, message, text })), expected,
      "the unchanged complete original source retains every exact range/later-context negative");
    assert.equal(new Set(evidence.map(issue => issue.start)).size === expected.length &&
      original.result.program === undefined && original.artifacts.size === 0, true,
    "every original failing expression is distinct and no invalid program or copied array is published");
    const compiled = compileCsharpNativeUseSource({ sourceText: supportedSourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const selected = carriers(compiled.result.program);
    const arms = name => {
      const result = getCsharpRuntimeUnionArms(selected.get(name), compiled.result.program.typeDefinitions);
      assert.equal(result !== undefined && result.every(arm => arm.kind === "source-primitive" &&
        ["int32", "uint32", "int64", "float64"].includes(arm.name)), true, `${name}: exact native primitive physical arms`);
      return result;
    };
    const types = { int32: "int", uint32: "uint", int64: "long", float64: "double" };
    const methods = [
      ["bare", "bareValues", ["int32", "uint32"]],
      ["reverse", "reverseValues", ["uint32", "int32"]],
      ["left", "leftValues", ["int32", "uint32", "int64"]],
      ["middle", "middleValues", ["int32", "int64", "uint32"]],
      ["right", "rightValues", ["int64", "int32", "uint32"]],
      ["wrapped", "wrappedValues", ["int32", "uint32", "int64"]],
      ["exactHuge", "hugeValues", ["int32", "uint32", "float64"], "System.Math.ScaleB(1D, 200)"],
    ].map(([method, name, values, literal = "1L"]) => {
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
    const inferredLong = armOf("inferredHeterogeneousValues", "int64");
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
if (inferredUnion[1].As${inferredDouble}() != 0.5D || inferredUnion[2].As${inferredLong}() != 9007199254740994L ||
    inferredUnion[3].As${inferredDouble}() != 0.1D ||
    inferredUnion[4].As${inferredLong}() != 0L ||
    System.BitConverter.DoubleToUInt64Bits(Subject.writtenNegativeZero()) != 0x8000000000000000UL ||
    System.BitConverter.DoubleToUInt64Bits(Subject.declaredNegativeZero()) != 0x8000000000000000UL)
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
    writeFileSync(new URL("source-and-native.json", root), JSON.stringify({ originalSourceText: sourceText,
      originalDiagnostics: evidence, sourceText: supportedSourceText, nativeProgram, artifacts: [...compiled.artifacts] }, null, 2));
    const output = executeCsharpConstruction(compiled, `C01-inferred-numeric-${surface}`, false, false, [], nativeProgram);
    writeFileSync(new URL("native-output.txt", root), output);
    assert.equal(output.trim().endsWith("numeric arrays: exact native values and costs"), true,
      "the actual generated program passed every native value, tag, sign, order and exact allocation control");
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} a nested generic union argument compiles in its actual native array layout`,
  { timeout: 300_000 }, () => {
    const originalSource = `
      function consume<T>(values: (string | T)[]): void {}
      export function run(): number {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; consume<number>(values); return 7;
      }`;
    const original = compileCsharpNativeUseSource({ surface, sourceText: originalSource });
    assert.equal(original.sourceDiagnosticsText, "");
    const issue = original.nativeStage.diagnostics[0];
    const ast = original.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const sourceUnion = combineCsharpTargetUnionMembers([csharpSourcePrimitiveTargetType("int64"),
      csharpSourcePrimitiveTargetType("float64"), csharpStringTargetType()]);
    const targetUnion = csharpRuntimeUnionTargetType([csharpStringTargetType(), csharpSourcePrimitiveTargetType("float64")]);
    const wrap = element => surface === "native" ? { kind: "array", element } : csharpJsArrayTargetType(element);
    assert.equal(original.targetDiagnostics.length === 1 && issue.code === "CSHARP_UNSUPPORTED_AST" &&
      issue.message === `No exact C# implicit conversion relates '${targetTypeRefKey(wrap(sourceUnion))}' to '${targetTypeRefKey(wrap(targetUnion))}'.` &&
      range?.kind === "authored" && ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) === "values", true,
    "the original later closed-union call cannot retarget an earlier native int64 array");
    assert.equal(original.result.program === undefined && original.artifacts.size === 0, true,
      "the original incompatible native array publishes no repaired artifacts");
    const compiled = compileCsharpNativeUseSource({ surface,
      sourceText: originalSource.replace("const values = [", "const values: (string | number)[] = [") });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `C01-selected-generic-array-layout-${surface}`, false, false, [], `
      if (Tsonic.Generated.Index.run() != 7D) throw new System.Exception("the actual generic array boundary did not compile and run");
      System.Console.WriteLine("selected generic array layout passed");`);
    assert.equal(output.includes("selected generic array layout passed"), true,
      "the original scalar, wide token and generic call reach a real native compiler without an array repair conversion");
  });
}

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

for (const operation of Array.from(["includes", "indexOf", "lastIndexOf"]).slice(0, 3)) {
test(`C130 js optional numeric-union ${operation} refuses the same unproven key relation`, () => {
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
  assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED" &&
    issue.message === `Array.${operation} over a numeric union requires an exact native cross-arm key equality relation.` &&
    text === `values.${operation}(value)`, true, "one exact source refusal, including its native key relation and operation node");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "native absence cannot hide an unproven present-payload key operation or publish a partial program");
});
}

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
    assert.equal(issues.length === 1 && issue.code === "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED" && text === expression, true,
      `${operation}: one canonical diagnostic retains its exact selected reason and original operation node`);
  }
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "aggregate source refusals never escape as a missing-fact invariant or partial emitted program");
});

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [formName, form, size] of Array.from(physicalForms).slice(0, 1)) {
for (const [operation, body] of Array.from(operationControls).slice(0, 4)) {
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

for (const [operation, body] of Array.from(operationControls).slice(12, 13)) {
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
}

for (const [formName, form, size] of Array.from(physicalForms).slice(1, 2)) {
for (const [operation, body] of Array.from(operationControls).slice(0, 3)) {
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
}
}
