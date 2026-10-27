import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { transformCsharpTargetAst } from "../../../dist/backend/target-ast/normalization/transformation.js";
import { csharpStructuralObjectShapeIdentity, csharpSourcePrimitiveTargetType, isCsharpJsValueTargetType, isCsharpRecordDictionaryTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { printCsharpType } from "../../../dist/print/source/printer.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { applyCsharpObjectShapeDisplayNames } from "../../../dist/backend/target-ast/normalization/object-shape-names.js";
import { selectCsharpObjectShapeDisplayNames } from "../../../dist/analysis/names/object-shapes.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";

const header = 'import type { int32 } from "@tsonic/core/types.js";';

const payload = "sealed class NativePayload : ITsClosedValueCarrier { public int count = 7; }";

const boxing = [
  ["logical-right", `function choose(input: unknown): unknown {
    const fallback = { count: 7 as int32 }; return input || fallback;
  }
  export function run(): boolean { return typeof choose(undefined) === "object"; }`,
  `var fallback = new NativePayload(); var input = default(TsValue);
   var result = TsValue.ToDynamicBoolean(input) ? input : TsValue.from(fallback);
   return TsValue.ApplyDynamicTypeof(result) == "object";`, payload],
  ["logical-left", `function choose(input: unknown): unknown {
    const first = { count: 7 as int32 }; return first || input;
  }
  export function run(): boolean { return typeof choose(undefined) === "object"; }`,
  `var first = TsValue.from(new NativePayload()); var input = default(TsValue);
   return TsValue.ApplyDynamicTypeof(TsValue.ToDynamicBoolean(first) ? first : input) == "object";`, payload],
  ["logical-condition", `function choose(input: unknown): unknown {
    const fallback = { count: 7 as int32 }; return input || fallback;
  }
  export function run(): boolean { if (choose(undefined)) return true; return false; }`,
  "return TsValue.ToDynamicBoolean(TsValue.from(new NativePayload()));", payload],
  ["discarded-short-circuit", `function choose(input: unknown): unknown {
    const fallback = { count: 7 as int32 }; return input || fallback;
  }
  let calls = 0 as int32;
  function effect(): void { calls += 1; }
  export function run(): boolean { calls = 0; choose(undefined) && effect(); return calls === 1; }`,
  "int calls = 0; if (TsValue.ToDynamicBoolean(TsValue.from(new NativePayload()))) calls++; return calls == 1;", payload],
  ["structural-method-result", `interface Reader { read(): unknown; }
  class Source { read() { return { count: 7 as int32 }; } }
  function read(source: Reader): unknown { return source.read(); }
  export function run(): boolean { return typeof read(new Source()) === "object"; }`,
  "INativeReader source = new NativeSource(); return TsValue.ApplyDynamicTypeof(source.read()) == \"object\";",
  `${payload}
   interface INativeReader { TsValue read(); }
   sealed class NativeSource : INativeReader, ITsClosedValueCarrier {
     public NativePayload read() { return new NativePayload(); }
     TsValue INativeReader.read() { return TsValue.from(read()); }
   }`],
  ["structural-property-result", `interface Reader { readonly value: unknown; }
  class Source { value = { count: 7 as int32 }; }
  export function run(): boolean { const source = new Source(); const reader: Reader = source;
    return reader.value === source.value && typeof reader.value === "object"; }`,
  "var source = new NativeSource(); INativeReader reader = source; return object.ReferenceEquals(TsValue.CastDynamic<NativePayload>(reader.value), source.value) && TsValue.ApplyDynamicTypeof(reader.value) == \"object\";",
  `${payload}
   interface INativeReader { TsValue value { get; } }
   sealed class NativeSource : INativeReader, ITsClosedValueCarrier {
     public NativePayload value = new NativePayload();
     TsValue INativeReader.value { get { return TsValue.from(value); } }
   }`],
  ["structural-method-parameter", `interface Reader { read(value: { count: int32 }): unknown; }
  class Source { read(value: unknown): unknown { return value; } }
  export function run(): boolean { const value = { count: 7 as int32 }; const reader: Reader = new Source();
    return reader.read(value) === value; }`,
  "var value = new NativePayload(); INativeReader reader = new NativeSource(); return object.ReferenceEquals(TsValue.CastDynamic<NativePayload>(reader.read(value)), value);",
  `${payload}
   interface INativeReader { TsValue read(NativePayload value); }
   sealed class NativeSource : INativeReader, ITsClosedValueCarrier {
     public TsValue read(TsValue value) { return value; }
     TsValue INativeReader.read(NativePayload value) { return read(TsValue.from(value)); }
   }`],
  ["explicit-value", `function box(value: { count: int32 }): unknown { return value; }
  export function run(): boolean { return typeof box({ count: 7 as int32 }) === "object"; }`,
  "return TsValue.ApplyDynamicTypeof(TsValue.from(new NativePayload())) == \"object\";", payload],
  ["nullable-value", `function box(value: { count: int32 } | null): unknown { return value; }
  export function run(): boolean { return typeof box({ count: 7 as int32 }) === "object" && typeof box(null) === "object"; }`,
  "return TsValue.ApplyDynamicTypeof(TsValue.from(new NativePayload())) == \"object\" && TsValue.ApplyDynamicTypeof(default(TsValue)) == \"object\";", payload],
  ["delegate-parameter-adaptation", `function identity(value: unknown): unknown { return value; }
  function invoke(callback: (value: { count: int32 }) => unknown): unknown { return callback({ count: 7 as int32 }); }
  export function run(): boolean { return typeof invoke(identity) === "object"; }`,
  "return TsValue.ApplyDynamicTypeof(NativeInvoke(value => TsValue.from(value))) == \"object\";",
  `${payload}
   static class NativeInvocation { public static TsValue invoke(Func<NativePayload, TsValue> callback) { return callback(new NativePayload()); } }`],
  ["class-result-adapter", `class Base { read(): unknown { return undefined; } }
  class Source extends Base { override read() { return { count: 7 as int32 }; } }
  export function run(): boolean { const reader: Base = new Source(); return typeof reader.read() === "object"; }`,
  "NativeBase reader = new NativeSource(); return TsValue.ApplyDynamicTypeof(reader.read()) == \"object\";",
  `${payload}
   class NativeBase : ITsClosedValueCarrier { public virtual TsValue read() { return default; } }
   sealed class NativeSource : NativeBase {
     private NativePayload nativeRead() { return new NativePayload(); }
     public override TsValue read() { return TsValue.from(nativeRead()); }
   }`],
];

function nativeCostProgram(generated, handwritten, definitions = "", setup = "") {
  return `using System;
using System.Runtime.CompilerServices;
using Tsonic.CSharp.Runtime;
using Tsonic.Generated;
using Index = Tsonic.Generated.Index;
${setup}
if (Generated() != 7 || Handwritten() != 7) throw new Exception("native observation or identity");
for (int iteration = 0; iteration < 8192; iteration++) { _ = Generated(); _ = Handwritten(); }
long generatedBefore = GC.GetAllocatedBytesForCurrentThread();
long generatedSum = 0;
for (int iteration = 0; iteration < 4096; iteration++) generatedSum += Generated();
long generatedBytes = GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = GC.GetAllocatedBytesForCurrentThread();
long nativeSum = 0;
for (int iteration = 0; iteration < 4096; iteration++) nativeSum += Handwritten();
long nativeBytes = GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
Console.WriteLine($"native-cost generated={generatedBytes} native={nativeBytes} sums={generatedSum}/{nativeSum}");
if (generatedSum != nativeSum || generatedSum != 4096L * 7 || generatedBytes != nativeBytes)
    throw new Exception($"native cost mismatch: generated={generatedBytes}, native={nativeBytes}");
[MethodImpl(MethodImplOptions.NoInlining)]
long Generated() { ${generated} }
[MethodImpl(MethodImplOptions.NoInlining)]
long Handwritten() { ${handwritten} }
${definitions}`;
}

const originalPrograms = [
  ["nested-parameter", "export function read(value: { nested: { count: int32 } }): int32 { return value.nested.count; }"],
  ["module-spread", "const original = { count: 7 as int32 }; export function copy() { return { ...original }; }"],
  ["destructured-rest", "export function read({ first, ...rest }: { first: int32; second: int32 }): int32 { return first + rest.second; }"],
  ["captured-storage", "export function maker(seed: int32): () => int32 { const value = { count: seed }; return () => value.count; }"],
  ["literal-method", "export function make(seed: int32) { return { value: seed, read(): int32 { return this.value; } }; }"],
  ["same-role-uses", "export function pair(left: int32, right: int32) { const first = { left }; const second = { right }; return { first, second }; }"],
];

function originalNativeProgram(name, selected) {
  if (name === "module-spread") return nativeCostProgram("return Index.copy().count;", "return new NativeCopy { count = 7 }.count;",
    "sealed class NativeCopy { public int count; }", "Index.__tsonic_module_init();");
  if (name === "captured-storage") return nativeCostProgram("return Index.maker(7)();", "int value = 7; Func<int> read = () => value; return read();");
  if (name === "literal-method") return nativeCostProgram("return Index.make(7).read();", "return new NativeMethod { value = 7 }.read();",
    "sealed class NativeMethod { public int value; public int read() { return value; } }");
  if (name === "same-role-uses") return nativeCostProgram("var pair = Index.pair(3, 4); return pair.first.left + pair.second.right;",
    "var pair = new NativePair { first = new NativeLeft { left = 3 }, second = new NativeRight { right = 4 } }; return pair.first.left + pair.second.right;",
    "sealed class NativeLeft { public int left; } sealed class NativeRight { public int right; } sealed class NativePair { public required NativeLeft first; public required NativeRight second; }");
  const parameter = selected.nodes.find(node => selected.source.ast.is.IsParameterDeclaration(node));
  const parameterType = selected.source.ast.as.AsParameterDeclaration(parameter)?.Type;
  assert.equal(parameterType !== undefined, true, `${name}: the original parameter has its authored type`);
  const carrier = selected.program.records.nodeTargetType.get(parameterType);
  assert.equal(carrier !== undefined, true, `${name}: the authored parameter type has its sealed carrier`);
  const shape = selected.program.objectShapes.resolveTarget(carrier);
  assert.equal(shape !== undefined, true, `${name}: real sealed parameter shape`);
  const declarations = selected.compiled.result.plan.sources.flatMap(source => source.unit.members.flatMap(member =>
    member.kind === "NamespaceDeclaration" ? member.members : [member]));
  const read = declarations.flatMap(declaration => declaration.kind === "ClassDeclaration" && declaration.name === "Index"
    ? declaration.members : []).find(member => member.kind === "MethodDeclaration" && member.name === "read");
  assert.equal(read !== undefined && read.parameters.length === 1, true, `${name}: the actual emitted read has its original parameter`);
  const syntax = read.parameters[0].type;
  const identity = csharpStructuralObjectShapeIdentity(carrier);
  assert.equal(typeof identity, "string", `${name}: the sealed carrier has an exact structural identity`);
  assert.equal(syntax.kind === "IdentifierName" && syntax.objectShapeIdentity === identity, true,
    `${name}: the normalized parameter type belongs to the actual sealed carrier`);
  const nativeType = printCsharpType(syntax);
  if (name === "destructured-rest") return nativeCostProgram("return Index.read(input);", "return input.first + input.second;",
    `sealed class NativeInput : ${nativeType} { public int first { get; set; } = 3; public int second { get; set; } = 4; }`, "var input = new NativeInput();");
  const nested = shape.members.find(member => member.sourceName === "nested");
  assert.equal(nested !== undefined, true, "the original nested payload member remains present");
  const nestedIdentity = csharpStructuralObjectShapeIdentity(nested.type);
  assert.equal(typeof nestedIdentity, "string", "the nested sealed carrier has its exact structural identity");
  let nestedSyntax;
  transformCsharpTargetAst(syntax, record => {
    if (record.kind === "IdentifierName" && record.objectShapeIdentity === nestedIdentity) {
      if (nestedSyntax !== undefined) assert.equal(printCsharpType(record), printCsharpType(nestedSyntax),
        "the actual closed parameter has one native instantiation of its nested payload");
      nestedSyntax = record;
    }
    return record;
  });
  assert.equal(nestedSyntax !== undefined, true, "the actual closed parameter contains its normalized nested carrier");
  const nestedType = printCsharpType(nestedSyntax);
  return nativeCostProgram("return Index.read(input);", "return input.nested.count;",
    `sealed class NativeLeaf : ${nestedType} { public int count { get; set; } = 7; }
     sealed class NativeInput : ${nativeType} { public ${nestedType} nested { get; set; } = new NativeLeaf(); }`, "var input = new NativeInput();");
}

export { header, payload, boxing, nativeCostProgram, originalPrograms, originalNativeProgram };
