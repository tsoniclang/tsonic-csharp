import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { assertCanonicalAnyRefusal } from "../../helpers/source-any-refusals.mjs";

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
export function readNested(): string { const value: any = nested(); return value.child.label; }
export function readOrdered(): number { const value: any = ordered(); return value.child.second; }
export function readAliased(): unknown { const value: any = aliased(); return value.first; }
`;

for (const surface of ["native", "js"]) {
  test(`fresh broad object construction seals ordered native value members on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCanonicalAnyRefusal(compiled);
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
export function readScalar(): number { const value: any = scalar(0); return value.value; }
export function readReference(): string { const value: any = reference(""); return value.value; }
export function readNested(): number { const value: any = nested(0); return value.child.value; }
` });
    assertCanonicalAnyRefusal(compiled);
  });
}

const typedSourceText = `
interface Child { label: string; }
interface Nested { value: number; child: Child; }
interface OrderedChild { second: number; }
interface Ordered { first: number; child: OrderedChild; last: number; }
interface Aliased { first: Box; second: Box; }
let order: string = "";
function mark(label: string, value: number): number { order = order + label; return value; }
export function trace(): string { return order; }
export function nested(): Nested { return { value: 1, child: { label: "ready" } }; }
export function ordered(): Ordered {
  return { first: mark("a", 1), child: { second: mark("b", 2) }, last: mark("c", 3) };
}
export class Box { value: number = 7; }
export function aliased(): Aliased {
  const box = new Box();
  return { first: box, second: box };
}
export function readNested(): string { return nested().child.label; }
export function readOrdered(): number { return ordered().child.second; }
export function readAliased(): Box { return aliased().first; }
`;

for (const surface of ["native", "js"]) {
  test(`typed broad-object companion preserves native member order, values and alias identity on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: typedSourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the typed native constructions publish their checked records");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 5, "both nested pairs and the alias container remain distinct allocations");
    const shapes = literals.map(node => {
      const physical = program.records.nativeExpression.get(node)?.physical;
      assert.equal(physical !== undefined && physical.kind !== "erased" &&
        physical.objectShape !== undefined && physical.dynamicObject === undefined, true,
      "each typed literal retains direct native storage rather than dynamic construction");
      return physical.objectShape;
    });
    assert.deepEqual(shapes.map(shape => shape.members.map(member => member.sourceName)),
      [["value", "child"], ["label"], ["first", "child", "last"], ["second"], ["first", "second"]],
      "all five original member inventories retain their exact checked order");
    for (const [index, shape] of shapes.entries()) {
      assert.equal(Object.isFrozen(shape), true, "the selected native shape is immutable");
      assert.equal(Object.isFrozen(shape.members), true, "the native member vector is immutable");
      assert.equal(shape.members.every(member => Object.isFrozen(member)), true,
        "each native member retains immutable checked name and initializer evidence");
      assert.equal(program.records.nativeExpression.get(literals[index]).physical.objectShape === shape, true,
        "repeated checked-record reads retain the identical native shape");
      assert.throws(() => shape.members.push(shape.members[0]), TypeError,
        "publication cannot acquire an additional member");
    }
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /TsObject|\.CreateDynamicObject\(|\.WriteDynamicSlot\(/u,
      "the five direct native constructions use neither dynamic containers nor dynamic field writes");
    assert.doesNotMatch(output, /new object\??\[|System\.Reflection|\bdynamic\b/u,
      "typed native construction adds no params array, reflection or dynamic dispatch");
    executeCsharpConstruction(compiled, `typed-broad-object-construction-${surface}`, false, false, [], `
var nested = Tsonic.Generated.Index.nested();
if (nested.value != 1 || nested.child.label != "ready" || Tsonic.Generated.Index.readNested() != "ready")
    throw new System.Exception("nested native values");
var ordered = Tsonic.Generated.Index.ordered();
if (Tsonic.Generated.Index.trace() != "abc" || ordered.first != 1 ||
    ordered.child.second != 2 || ordered.last != 3)
    throw new System.Exception("initializer order and exactly-once effects");
var aliased = Tsonic.Generated.Index.aliased();
if (aliased.first.value != 7 || !object.ReferenceEquals(aliased.first, aliased.second))
    throw new System.Exception("stored native alias identity");
if (Tsonic.Generated.Index.readOrdered() != 2 || Tsonic.Generated.Index.trace() != "abcabc" ||
    Tsonic.Generated.Index.readAliased().value != 7)
    throw new System.Exception("typed native readers retain the original values and order");
`);
  });

  test(`typed broad-object companion matches strict handwritten escaping allocation on ${surface}`, { timeout: 300_000 }, context => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Scalar = { value: number };
type Reference = { value: string };
type Nested = { child: Scalar };
export function scalar(value: number): Scalar { return { value }; }
export function reference(value: string): Reference { return { value }; }
export function nested(value: number): Nested { return { child: { value } }; }
export function readScalar(): number { return scalar(0).value; }
export function readReference(): string { return reference("").value; }
export function readNested(): number { return nested(0).child.value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /TsObject|CreateDynamicObject\(|WriteDynamicSlot\(|new object\??\[|System\.Reflection|\bdynamic\b/u,
      "native scalar, reference and nested storage adds no dictionary, params array, reflection or dynamic access");
    const measurements = executeCsharpConstruction(compiled, `typed-broad-object-allocation-${surface}`, false, false, [], `
using System;
using System.Runtime.CompilerServices;
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
if (Escape.Value is not NativeNested native || native.child.value != 8191)
    throw new Exception("escaping handwritten nested payload");
var generated = Index.nested(8191);
var child = generated.child;
if (child.value != 8191 || !object.ReferenceEquals(child, generated.child))
    throw new Exception("escaping native nested payload and repeated-read identity");
if (Index.scalar(23).value != 23 || Index.reference("retained").value != "retained" ||
    Index.readScalar() != 0 || Index.readReference() != "" || Index.readNested() != 0)
    throw new Exception("typed scalar, reference and nested readers preserve the original values");
Console.WriteLine($"scalar={generatedScalar}/{nativeScalar};reference={generatedReference}/{nativeReference};nested={generatedNested}/{nativeNested}");
static class Escape { public static object? Value; }
sealed class NativeScalar { public double value; }
sealed class NativeReference { public string value = ""; }
sealed class NativeNested { public NativeScalar child = null!; }
static class Native {
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static NativeScalar scalar(double value) => new NativeScalar { value = value };
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static NativeReference reference(string value) => new NativeReference { value = value };
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static NativeNested nested(double value) => new NativeNested { child = new NativeScalar { value = value } };
}
`);
    assert.match(measurements, /^scalar=(\d+)\/\1;reference=(\d+)\/\2;nested=(\d+)\/\3\s*$/u,
      "all three escaping allocation costs equal their idiomatic handwritten native counterparts exactly");
    context.diagnostic(`native ${surface}: ${measurements.trim()}`);
  });
}

