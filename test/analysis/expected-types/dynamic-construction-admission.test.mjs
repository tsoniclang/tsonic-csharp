import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const cases = [
  ["accessor", "return { get count(): number { return 7; } };", "count", "named data properties"],
  ["method", "return { read(): number { return 7; } };", "read", "named data properties"],
  ["spread", "return { ...{ count: 7 } };", "count", "named data properties"],
  ["effectful key", 'return { [key()]: 7 };', "count", "effect-free constant member names"],
];

for (const surface of ["native", "js"]) {
  for (const [name, body, member, reason] of cases) {
    test(name === "method" ? `closed native method construction preserves its stable callable value on ${surface}`
      : `an unsupported dynamic ${name} construction is refused at its owner before publication on ${surface}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
function key(): "count" { return "count"; }
export function make(): unknown { ${body} }
export function read(): unknown { const observed: any = make(); return observed.${member}; }
` });
      assertCsharpCheckingSucceeded(compiled);
      if (name === "method") {
        assertCsharpCompilationSucceeded(compiled);
        const output = [...compiled.artifacts.values()].join("\n");
        assert.doesNotMatch(output, /TsFunction|TsObject|CreateDynamicObject|DynamicInvoke|System\.Reflection/u);
        executeCsharpConstruction(compiled, `closed-native-method-value-${surface}`, false, false, [], `
using System;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
var instance = Index.make();
var first = instance.ReadDynamicSlot("read");
var again = instance.ReadDynamicSlot("read");
var other = Index.make().ReadDynamicSlot("read");
if (!TsValue.StrictEqual(first, again) || !TsValue.StrictNotEqual(first, other) ||
    TsValue.ApplyDynamicTypeof(first) != "function" || TsValue.StrictEqual(first, TsValue.undefined()) ||
    TsValue.CastDynamic<Func<double>>(first)() != 7D ||
    TsValue.CastDynamic<Func<double>>(Index.read())() != 7D)
    throw new Exception("native delegate identity, typeof, absence and original payload");
var native = TsValue.from(new NativeMethod());
for (int iteration = 0; iteration < 4096; iteration++) {
    Escape.Value = instance.ReadDynamicSlot("read");
    Escape.Value = native.ReadDynamicSlot("read");
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = instance.ReadDynamicSlot("read");
long actual = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = native.ReadDynamicSlot("read");
long reference = GC.GetAllocatedBytesForCurrentThread() - before;
if (actual != reference || actual != 0) throw new Exception($"native delegate read allocation {actual} != {reference}");
for (int iteration = 0; iteration < 4096; iteration++) {
    Escape.Value = Index.make();
    Escape.Value = TsValue.from(new NativeMethod());
}
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Index.make();
actual = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = TsValue.from(new NativeMethod());
reference = GC.GetAllocatedBytesForCurrentThread() - before;
if (actual != reference) throw new Exception($"native delegate construction allocation {actual} != {reference}");
static class Escape { public static TsValue Value; }
sealed class NativeMethod : ITsClosedValueCarrier, IDynamicObject {
    public Func<double> read;
    public NativeMethod() { read = Read; }
    private double Read() => 7D;
    public bool TryReadDynamicSlot(string key, out object? value) {
        if (key == "read") { value = read; return true; }
        value = null;
        return false;
    }
    public void WriteDynamicSlot(string key, object? value) {
        if (key == "read") { read = TsValue.CastDynamic<Func<double>>(value); return; }
        throw new NotSupportedException("The closed native object has no writable property with this name.");
    }
}
`);
        return;
      }
      const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
      assert.equal(issues.length, 1,
        `one precise dynamic construction refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      if (name === "effectful key") {
        assert.equal(issues[0].code, "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN", "the existing checked property-name owner rejects effectful keys");
        assert.equal(issues[0].message,
          "A computed property key call must retain its effects and cannot be replaced with a static native field name.",
          "the complete existing effect-preservation refusal remains exact");
        assert.equal(compiled.source.ast.is.IsComputedPropertyName(issues[0].sourceNode), true,
          "the original checked computed property name owns the refusal");
      } else {
        assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "unsupported dynamic storage is a source refusal, not an internal failure");
        assert.equal(issues[0].message.includes(reason), true, "the actual unsupported dynamic member contract is named");
        assert.equal(compiled.source.ast.is.IsObjectLiteralExpression(issues[0].sourceNode), true,
          "the selected construction's original checked literal owns the refusal");
      }
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
        true, "a dynamic requirement cannot publish a native-shape fallback or partial artifacts");
    });
  }

  test(`a closed native method cannot acquire dynamic invocation through any on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function make(): unknown { return { read(): number { return 7; } }; }
export function read(): unknown { const observed: any = make(); return observed.read(); }
` });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "CSHARP_NATIVE_PARTICIPATION_NOT_CLOSED");
    assert.equal(issues[0].message, "A symbolic callable invocation has no selected implementation execution.");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true);
  });

  test(`a checked native interface still invokes the original closed method on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
interface Api { read(): number; }
function make(): unknown { return { read(): number { return 7; } }; }
export function run(): boolean { const value = make() as Api; return value.read() === 7; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `closed-native-method-interface-${surface}`);
  });

  test(`native accessor, method and spread constructions remain native when no dynamic receiver is required on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function run(): boolean {
  let reads: number = 0;
  const getter = { get count(): number { reads += 1; return 7; } };
  const method = { read(): number { return 13; } };
  const original = { count: 17 };
  const spread = { ...original, extra: 19 };
  return getter.count === 7 && reads === 1 && method.read() === 13 && spread.count === 17 && spread.extra === 19;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-construction-admission-control-${surface}`);
  });
}
