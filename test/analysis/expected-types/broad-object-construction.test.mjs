import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDiagnosticSpanReader } from "@tsonic/target-api/source";
import { finalizeTargetDiagnostics } from "../../../../tsonic/packages/host/dist/diagnostics.js";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
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
export function readNested(): string { const value: any = nested(); return value.child.label; }
export function readOrdered(): number { const value: any = ordered(); return value.child.second; }
export function readAliased(): unknown { const value: any = aliased(); return value.first; }
`;

function assertCanonicalAnyRefusal(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length > 0, true, "the original any-containing source still requires the shared admission refusal");
  const ast = compiled.source.ast;
  const readSpan = createSourceDiagnosticSpanReader(ast);
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  compiled.source.sourceFiles.filter(file => file !== undefined && !ast.isDeclarationFile(file)).forEach(visit);
  for (const issue of issues) {
    assert.equal(issue.code, "TSONIC_ANY_UNSUPPORTED", "one canonical shared source-any diagnostic owns the failure");
    assert.equal(issue.message, "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
    assert.equal(nodes.has(issue.sourceNode), true, "the refusal retains its actual checked project-source occurrence");
    const file = ast.getSourceFile(issue.sourceNode);
    const queries = compiled.source.getSourceFileQueries(file);
    assert.equal(queries.typeShape.isAny(queries.checker.getTypeAtLocation(issue.sourceNode)), true,
      "the diagnostic names an actual checked any value or authored type, not the native producer");
    const expected = readSpan(file, ast.pos(issue.sourceNode), ast.end(issue.sourceNode));
    assert.equal(expected !== undefined, true, "the checked source occurrence has a real source span");
    const finalized = finalizeTargetDiagnostics(compiled.source, [issue], "/project")[0];
    assert.deepEqual(finalized.sourceSpan, { ...expected, fileName: "index.ts" }, "the exact original source coordinates are preserved");
  }
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "source-any admission refuses publication rather than selecting a dynamic native representation");
}

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

const declaredNativeSource = `
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
`;

for (const surface of ["native", "js"]) {
  test(`declared native object construction retains ordered members and shared references on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: declaredNativeSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the declared native constructions are admitted");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 5, "the same two nested pairs and shared-reference container remain distinct constructions");
    assert.deepEqual(literals.map(node => program.records.nativeExpression.get(node)?.physical.objectShape?.members.map(member => member.sourceName)),
      [["value", "child"], ["label"], ["first", "child", "last"], ["second"], ["first", "second"]],
      "each construction retains every original member in its checked order");
    for (const node of literals) {
      const physical = program.records.nativeExpression.get(node)?.physical;
      assert.equal(physical !== undefined && physical.kind !== "erased" &&
        physical.objectShape !== undefined && physical.dynamicObject === undefined, true,
      "declared native storage is never selected from a later dynamic reader");
      assert.equal(Object.isFrozen(physical.objectShape), true, "the selected native shape is immutable");
      assert.equal(Object.isFrozen(physical.objectShape.members), true, "the exact native member inventory is immutable");
      assert.equal(physical.objectShape.members.every(member => Object.isFrozen(member)), true,
        "each native member retains immutable checked evidence");
    }
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /new Tsonic\.CSharp\.Runtime\.TsObject\(|\.CreateDynamicObject\(|\.WriteDynamicSlot\(/u,
      "the declared native objects do not acquire dictionary construction or writes");
    assert.doesNotMatch(output, /new object\??\[|System\.Reflection|\bdynamic\b/u,
      "native construction adds no params-array boxing, reflection or dynamic dispatch");
    executeCsharpConstruction(compiled, `declared-native-object-construction-${surface}`, false, false, [], `
var nested = Tsonic.Generated.Index.nested();
if (nested.value != 1 || nested.child.label != "ready")
    throw new System.Exception("nested native values");
var ordered = Tsonic.Generated.Index.ordered();
if (Tsonic.Generated.Index.trace() != "abc" || ordered.first != 1 ||
    ordered.child.second != 2 || ordered.last != 3)
    throw new System.Exception("initializer order and exactly-once effects");
var aliased = Tsonic.Generated.Index.aliased();
if (aliased.first.value != 7 || !object.ReferenceEquals(aliased.first, aliased.second))
    throw new System.Exception("stored native alias identity");
`);
  });

  test(`escaping declared native scalar, reference and nested objects match handwritten allocation on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Scalar = { value: number };
type Reference = { value: string };
type Nested = { child: Scalar };
export function scalar(value: number): Scalar { return { value }; }
export function reference(value: string): Reference { return { value }; }
export function nested(value: number): Nested { return { child: { value } }; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /TsObject|CreateDynamicObject\(|WriteDynamicSlot\(|System\.Reflection|\bdynamic\b/u,
      "native scalar, reference and nested fields do not use dynamic storage");
    const measurements = executeCsharpConstruction(compiled, `declared-native-object-allocation-${surface}`, false, false, [], `
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
      "all three original escaping allocation predicates match their idiomatic native counterparts exactly");
  });
}
