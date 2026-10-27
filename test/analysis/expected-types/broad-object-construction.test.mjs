import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const sourceText = `
let order: string = "";
function mark(label: string, value: number): number { order = order + label; return value; }
export function trace(): string { return order; }
export function nested(): unknown { return { value: 1, child: { label: "ready" } }; }
export function ordered(): unknown {
  return { first: mark("a", 1), child: { second: mark("b", 2) }, last: mark("c", 3) };
}
export class Box { value: number = 7; }
export function aliased(): unknown {
  const box = new Box();
  return { first: box, second: box };
}
`;

for (const surface of ["native", "js"]) {
  test(`fresh broad object construction seals ordered native value members on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the checked program publishes its admitted records");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 5, "both nested literals and the alias container are checked");
    for (const node of literals) {
      const use = program.records.nativeExpression.get(node)?.physical;
      assert.equal(use !== undefined && use.kind !== "erased" && use.dynamicObject !== undefined &&
        use.objectShape === undefined, true, "fresh broad construction carries a sealed member plan, not a synthetic shape");
      assert.equal(Object.isFrozen(use.dynamicObject), true, "the selected authored member order is immutable");
      assert.equal(Object.isFrozen(use.dynamicObject.members), true, "the native object member vector is immutable");
      assert.equal(use.dynamicObject.members.every(member => Object.isFrozen(member)), true,
        "each selected member retains immutable checked name and initializer evidence");
    }
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal((output.match(/new Tsonic\.CSharp\.Runtime\.TsObject\(\)/gu) ?? []).length, 5,
      "one direct native construction is emitted for each fresh literal");
    assert.equal(/\.CreateDynamicObject\(|new object\??\[/u.test(output), false,
      "direct native field writes do not allocate a params array or box the closed value carrier");
    assert.equal(/\bObjectShape_[a-f0-9]+\b|System\.Reflection|\bdynamic\b/u.test(output), false,
      "fresh broad literals require neither a boxed intermediate shape nor reflective access");
    assert.equal(/\.WriteDynamicSlot\("value",/u.test(output) && /\.WriteDynamicSlot\("label",/u.test(output), true,
      "the nested literal retains both exact native fields");
    executeCsharpConstruction(compiled, `broad-object-construction-${surface}`, false, false, [], `
var nested = Tsonic.Generated.Index.nested();
if (System.Convert.ToInt64(nested.ReadDynamicSlot("value").unwrap()) != 1 ||
    nested.ReadDynamicSlot("child").ReadDynamicSlotAs<string>("label") != "ready")
    throw new System.Exception("nested native values");
var ordered = Tsonic.Generated.Index.ordered();
if (Tsonic.Generated.Index.trace() != "abc" ||
    System.Convert.ToInt64(ordered.ReadDynamicSlot("last").unwrap()) != 3)
    throw new System.Exception("initializer order and exactly-once effects");
var aliased = Tsonic.Generated.Index.aliased();
if (!object.ReferenceEquals(aliased.ReadDynamicSlot("first").unwrap(), aliased.ReadDynamicSlot("second").unwrap()))
    throw new System.Exception("stored native alias identity");
`);
  });
}

test("method-only typed literals retain their selected native object representation", () => {
  const compiled = compileCsharpSource({ sourceText: `
export function run(): boolean {
  const value: { read(): number } = { read(): number { return 7; } };
  return value.read() === 7;
}` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("CreateDynamicObject("), false,
    "an authored native method body is not discarded into a broad data-only construction");
  executeCsharpConstruction(compiled, "broad-object-native-method-control");
});

for (const surface of ["native", "js"]) {
  test(`escaping broad scalar, reference and nested objects match native allocation on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function scalar(value: number): unknown { return { value }; }
export function reference(value: string): unknown { return { value }; }
export function nested(value: number): unknown { return { child: { value } }; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(output.includes("CreateDynamicObject("), false, "no params-array helper is selected for any native object");
    executeCsharpConstruction(compiled, `broad-object-allocation-${surface}`, false, false, [], `
using System;
using System.Runtime.CompilerServices;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
for (int iteration = 0; iteration < 4096; iteration++) {
    Escape.Value = Index.scalar(iteration);
    Escape.Value = Native.scalar(iteration);
    Escape.Value = Index.reference("retained");
    Escape.Value = Native.reference("retained");
    Escape.Value = Index.nested(iteration);
    Escape.Value = Native.nested(iteration);
}
long start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Index.scalar(iteration);
long generatedScalar = GC.GetAllocatedBytesForCurrentThread() - start;
start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Native.scalar(iteration);
long nativeScalar = GC.GetAllocatedBytesForCurrentThread() - start;
if (generatedScalar != nativeScalar) throw new Exception($"scalar allocation {generatedScalar} != {nativeScalar}");
start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Index.reference("retained");
long generatedReference = GC.GetAllocatedBytesForCurrentThread() - start;
start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Native.reference("retained");
long nativeReference = GC.GetAllocatedBytesForCurrentThread() - start;
if (generatedReference != nativeReference) throw new Exception($"reference allocation {generatedReference} != {nativeReference}");
start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Index.nested(iteration);
long generatedNested = GC.GetAllocatedBytesForCurrentThread() - start;
start = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) Escape.Value = Native.nested(iteration);
long nativeNested = GC.GetAllocatedBytesForCurrentThread() - start;
if (generatedNested != nativeNested) throw new Exception($"nested allocation {generatedNested} != {nativeNested}");
if (Convert.ToInt64(Escape.Value.ReadDynamicSlot("child").ReadDynamicSlot("value").unwrap()) != 8191)
    throw new Exception("escaping native nested payload");
static class Escape { public static TsValue Value; }
static class Native {
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static TsValue scalar(double value) {
        var target = new TsObject();
        target.WriteDynamicSlot("value", value);
        return TsValue.from(target);
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static TsValue reference(string value) {
        var target = new TsObject();
        target.WriteDynamicSlot("value", value);
        return TsValue.from(target);
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static TsValue nested(double value) {
        var child = new TsObject();
        child.WriteDynamicSlot("value", value);
        var target = new TsObject();
        target.WriteDynamicSlot("child", child);
        return TsValue.from(target);
    }
}
`);
  });
}
