import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-type-rendering.js";
import { printCsharpType } from "../../../dist/print/source/printer.js";

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

for (const surface of ["native", "js"]) for (const [name, body, nativeBody, definitions] of boxing) {
  test(`${surface}: actual ${name} boxes only admitted references and preserves native identity and cost`, { timeout: 300_000 }, () => {
    const { compiled, program } = compileCsharpRequiredRecordSource(header + body, surface);
    const marked = program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.capabilities.includes("reference-identity"));
    assert.equal(marked.length > 0, true, "the actual admitted boxing edge publishes its reference capability before planning");
    assert.equal(marked.some(artifact => artifact.fact.members.some(member => member.sourceName === "count")), true,
      "the boxed payload itself, not only the nominal receiver, has exact reference identity");
    const baseline = nativeBody.replace("NativeInvoke(", "NativeInvocation.invoke(");
    const output = executeCsharpConstruction(compiled, `artifact-box-${surface}-${name}`, false, false, [],
      nativeCostProgram("return Index.run() ? 7 : -1;", `${baseline.replace(/return ([^;]+);\s*$/u, "return ($1) ? 7 : -1;")}`, definitions));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "real native execution measures exact warmed allocation counts; a runtime carrier failure cannot count as a compilation pass");
  });
}

for (const surface of ["native", "js"]) {
  test(`${surface}: plain unboxed shapes do not gain a closed broad-value marker`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + "export function make() { return { count: 7 as int32 }; }" });
    assertCsharpCompilationSucceeded(compiled);
    const shapes = compiled.result.program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.materialization === "synthetic" &&
      artifact.fact.members.some(member => member.sourceName === "count"));
    assert.equal(shapes.length > 0, true, "a real generated plain shape remains in the artifact set");
    assert.equal(shapes.every(artifact => !artifact.capabilities.includes("reference-identity")), true, "no blanket every-shape capability");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("ITsClosedValueCarrier")), false,
      "plain native storage remains free of the compatibility marker");
  });
  test(`${surface}: retained structural rest adapters box every admitted payload without losing alias identity`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `
      interface Reader { read(...values: { count: int32 }[]): unknown; }
      class Source { read(...values: unknown[]): unknown { return values[0]; } }
      export function run(): boolean {
        const value = { count: 7 as int32 }; const reader: Reader = new Source(); return reader.read(value) === value;
      }
    ` });
    executeCsharpConstruction(compiled, `artifact-box-rest-${surface}`);
  });
  test(`${surface}: contextual parameter/default adapters retain the actual selected boxed storage`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `
      function invoke(callback: (value: { count: int32 }) => boolean): boolean { return callback({ count: 7 as int32 }); }
      export function run(): boolean {
        return invoke((value: unknown = { count: 7 as int32 }): boolean => typeof value === "object");
      }
    ` });
    executeCsharpConstruction(compiled, `artifact-box-default-${surface}`);
  });
}

test("selected closed Object.values member conversions retain exact nested payload identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: header + `
    export function run(): boolean {
      const nested = { count: 7 as int32 }; const broad: unknown = "text";
      const source = { nested, broad }; const values = Object.values(source);
      return values[0] === nested && values[1] === broad;
    }
  ` });
  executeCsharpConstruction(compiled, "artifact-box-selected-projection");
});

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
  const nativeType = printCsharpType(csharpTypeFromTargetTypeRef(carrier));
  if (name === "destructured-rest") return nativeCostProgram("return Index.read(input);", "return input.first + input.second;",
    `sealed class NativeInput : ${nativeType} { public int first { get; set; } = 3; public int second { get; set; } = 4; }`, "var input = new NativeInput();");
  const nested = shape.members.find(member => member.sourceName === "nested");
  const nestedType = printCsharpType(csharpTypeFromTargetTypeRef(nested.type));
  return nativeCostProgram("return Index.read(input);", "return input.nested.count;",
    `sealed class NativeLeaf : ${nestedType} { public int count { get; set; } = 7; }
     sealed class NativeInput : ${nativeType} { public ${nestedType} nested { get; set; } = new NativeLeaf(); }`, "var input = new NativeInput();");
}

for (const surface of ["native", "js"]) for (const [name, body] of originalPrograms) {
  test(`${surface}: original ${name} has real native observations and idiomatic allocation controls`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const output = executeCsharpConstruction(selected.compiled, `original-shape-${surface}-${name}`, false, false, [], originalNativeProgram(name, selected));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "the unmodified original program runs; handwritten baselines do not allocate dead rest/capture objects merely to match compiler output");
  });
}
