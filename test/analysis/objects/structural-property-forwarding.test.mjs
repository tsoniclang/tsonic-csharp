import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { finalizeCsharpStructuralInterfaceForwarding } from "../../../dist/analysis/objects/structural-forwarding.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/method-values.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const number = Object.freeze({ kind: "source-primitive", name: "float64" });

function propertyFixture(target = number) {
  const sourceNode = Object.freeze({});
  const sourceType = csharpTargetNamedType("test.PropertyBody", undefined, { kind: "named", name: "PropertyBody" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [] });
  const interfaceType = csharpTargetNamedType("test.PropertyView", undefined, { kind: "named", name: "PropertyView" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [] });
  const property = Object.freeze({ sourceName: "value", sourceType: integer,
    member: Object.freeze({ sourceName: "value", targetName: "value", memberKind: "property", readonly: true, type: target }) });
  const selected = Object.freeze({ sourceNode, sourceType, interfaceType,
    methods: Object.freeze([]), properties: Object.freeze([property]) });
  let shapeReads = 0;
  const policy = { ast: {}, target: {}, providers: { findTargetBindingByTargetId: () => undefined },
    projectTypes: { directSupertypes: () => [], catalog: { definitionForDeclaration: () => undefined } },
    objectShapes: { resolveNode: () => undefined, resolveTarget() { shapeReads += 1; return undefined; } } };
  const shapes = { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]),
    structuralImplementations: () => Object.freeze([selected]) };
  const forbidden = () => assert.fail("property admission has no callable or default dependency");
  return { sourceNode, sourceType, property, selected, policy, shapes, reads: () => shapeReads,
    callables: { callableDispatch: { get: forbidden } }, declarations: { runtimeDefault: { get: forbidden } } };
}

test("readonly native property admission publishes the single exact conversion and lookup-only evidence", () => {
  const value = propertyFixture();
  const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
  const implementations = finalized.objectShapes.structuralImplementations(value.sourceType);
  const property = implementations[0]?.properties[0];
  assert.equal(finalized.issues.length, 0, "native int32-to-number reads are admitted without changing their backing storage");
  assert.equal(property?.sourceType === integer && property.read.source === integer && property.read.target === number, true,
    "the actual source carrier and required destination read carrier are exact");
  assert.equal(property?.read.conversion.kind === "implicit" && property.read.conversion.proof === "numeric", true,
    "canonical native value admission owns the numeric conversion");
  assert.equal(implementations[0].sourceNode === value.sourceNode, true, "the original checked source identity survives publication");
  assert.equal(Object.isFrozen(implementations) && Object.isFrozen(property) && Object.isFrozen(property.read), true,
    "every published forwarding decision is immutable");
  assert.equal(Object.hasOwn(finalized.objectShapes, "issues"), false, "expected analysis issues are not a backend service");
  const completedReads = value.reads();
  value.policy.objectShapes.resolveTarget = () => assert.fail("a final property read cannot reopen conversion admission");
  value.shapes.structuralImplementations = () => assert.fail("a final property read cannot repeat logical selection");
  assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType) === implementations, true,
    "the final reader preserves exact record identity");
  assert.equal(value.reads(), completedReads, "published reads perform no new native relation query");
});

test("readonly admission failures remain expected source issues and publish no failed native property", () => {
  const value = propertyFixture(Object.freeze({ kind: "source-primitive", name: "string" }));
  const inherited = Object.freeze({ node: value.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
    message: "An analyzed interface has no exact inherited native implementation." });
  value.shapes.issues = Object.freeze([inherited]);
  const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
  assert.equal(finalized.issues.length, 2, "all existing inherited and property admission failures are collected together");
  assert.equal(finalized.issues[0] === inherited, true, "the existing graph owner issue is not dropped or relabelled");
  assert.equal(finalized.issues[1]?.node === value.sourceNode && finalized.issues[1]?.code === "CSHARP_UNSUPPORTED_AST" &&
    finalized.issues[1]?.message === "An analyzed interface property has no exact native forwarding conversion.", true,
  "a reachable unsupported relation is rejected at its exact source before publication, not thrown as an internal invariant");
  assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0].properties.length, 0,
    "a failed native property has no partial selected conversion for the planner");
  assert.equal(Object.isFrozen(finalized.issues), true, "the program's pre-seal rejection input is immutable");
});

test("writable structural properties require exact storage while readonly reads reach canonical admission", () => {
  const sourceNode = Object.freeze({});
  const targetType = (name, kind) => csharpTargetNamedType(`test.${name}`, undefined, { kind: "named", name },
    { sourceDeclarationKind: kind, allowsRefLikeTypeArguments: [] });
  const member = (type, readonly) => Object.freeze({ sourceKey: { kind: "property", name: "value" },
    sourceName: "value", targetName: "value", memberKind: "property", type, readonly });
  const read = member(integer, false);
  for (const [label, write, admitted] of [
    ["readonly widening", member(number, true), true],
    ["writable exact", member(integer, false), true],
    ["writable widening", member(number, false), false],
  ]) {
    const selected = selectCsharpStructuralInterfaceImplementation({ sourceNode,
      source: { targetType: targetType("Body", "class"), members: [read] },
      destination: { targetType: targetType("View", "interface"), members: [write] },
      members: [{ source: read, destination: write, openSource: read, openDestination: write, parameterDefaults: [] }] });
    assert.equal(selected !== undefined, admitted, `${label}: the existing native storage rule`);
    if (selected !== undefined) assert.equal(selected.properties[0]?.sourceType === integer, true,
      `${label}: selected reads retain the original native storage width`);
  }
});

const readonlySource = `import type { int32 } from "@tsonic/core/types.js";
interface ReadBase { readonly value: number; }
interface ReadChild extends ReadBase { readonly value: int32; }
class ReadBody { value: int32 = 7; }
class DirectReadBody implements ReadChild { value: int32 = 7; }
class InheritedReadBody extends DirectReadBody {}
export function readInherited(): number {
  const child: ReadChild = new ReadBody();
  const base: ReadBase = child;
  return base.value;
}
export function readDeclared(): number {
  const body = new DirectReadBody();
  const base: ReadBase = body;
  return base.value;
}
export function readNativeBase(): number { const base: ReadBase = new InheritedReadBody(); return base.value; }
interface DirectDefault { read(value?: int32): int32; }
class DirectDefaultBody implements DirectDefault { read(value: int32 = 23): int32 { return value; } }
export function readDeclaredDefault(): int32 { const value: DirectDefault = new DirectDefaultBody(); return value.read(); }
interface DirectGeneric { identity<T>(value: T): T; }
class DirectGenericBody implements DirectGeneric { identity<Value>(value: Value): Value { return value; } }
export function readDeclaredGeneric(): int32 { const value: DirectGeneric = new DirectGenericBody(); return value.identity<int32>(29); }
interface NumericBase { readonly value: number; }
interface NumericChild extends NumericBase { readonly value: int32; }
export class NumericBody {
  calls: int32 = 0;
  get value(): int32 { this.calls += 1; return 7; }
}
export function observeNumeric(body: NumericBody): number {
  const child: NumericChild = body;
  const base: NumericBase = child;
  return base.value;
}
export class BaseValue { value: int32 = 11; }
export class DerivedValue extends BaseValue { extra: int32 = 13; }
interface ReferenceBase { readonly value: BaseValue; }
interface ReferenceChild extends ReferenceBase { readonly value: DerivedValue; }
export class ReferenceBody { value: DerivedValue = new DerivedValue(); }
export function observeReference(body: ReferenceBody): BaseValue {
  const child: ReferenceChild = body;
  const base: ReferenceBase = child;
  return base.value;
}
interface NullableBase { readonly value: BaseValue | null; }
interface NullableChild extends NullableBase { readonly value: DerivedValue | null; }
export class NullableBody { value: DerivedValue | null = null; }
export function observeNullable(body: NullableBody): BaseValue | null {
  const child: NullableChild = body;
  const base: NullableBase = child;
  return base.value;
}
interface MutableBase { value: int32; }
interface MutableChild extends MutableBase {}
export class MutableBody { value: int32 = 1; }
class DirectMutableBody implements MutableChild { value: int32 = 1; }
export function updateDeclared(): int32 { const value: MutableChild = new DirectMutableBody(); value.value = 17; return value.value; }
export function update(body: MutableBody, value: int32): int32 {
  const child: MutableChild = body;
  const base: MutableBase = child;
  base.value = value;
  return body.value;
}`;

const nativeObserver = `
if (Tsonic.Generated.Index.readInherited() != 7) throw new System.Exception("inherited readonly native value");
if (Tsonic.Generated.Index.readDeclared() != 7 || Tsonic.Generated.Index.readDeclaredDefault() != 23 ||
    Tsonic.Generated.Index.readDeclaredGeneric() != 29 || Tsonic.Generated.Index.readNativeBase() != 7 ||
    Tsonic.Generated.Index.updateDeclared() != 17) throw new System.Exception("declared native interface obligations");
var numeric = new Tsonic.Generated.NumericBody(); var nativeNumeric = new NativeNumeric();
var reference = new Tsonic.Generated.ReferenceBody(); var nativeReference = new NativeReference();
var nullable = new Tsonic.Generated.NullableBody(); var nativeNullable = new NativeNullable();
var mutable = new Tsonic.Generated.MutableBody();
if (Tsonic.Generated.Index.observeNumeric(numeric) != 7 || numeric.calls != 1)
    throw new System.Exception("exactly one readonly source getter");
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.observeReference(reference), reference.value))
    throw new System.Exception("readonly reference identity");
if (Tsonic.Generated.Index.observeNullable(nullable) != null) throw new System.Exception("one native absence");
nullable.value = reference.value; nativeNullable.value = nativeReference.value;
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.observeNullable(nullable), reference.value))
    throw new System.Exception("nullable readonly reference identity");
if (Tsonic.Generated.Index.update(mutable, 19) != 19 || mutable.value != 19)
    throw new System.Exception("inherited writable field aliases original storage");
for (int index = 0; index < 8192; index++) { _ = Generated(); _ = Native(); }
int generatedCalls = numeric.calls, nativeCalls = nativeNumeric.calls;
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread(); double generatedSum = 0;
for (int index = 0; index < 8192; index++) generatedSum += Generated();
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread(); double nativeSum = 0;
for (int index = 0; index < 8192; index++) nativeSum += Native();
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 8192 * 29.0 || nativeSum != generatedSum || generatedBytes != 0 || nativeBytes != 0 ||
    numeric.calls - generatedCalls != 8192 || nativeNumeric.calls - nativeCalls != 8192)
    throw new System.Exception($"readonly cost or evaluation: bytes={generatedBytes}/{nativeBytes}, sum={generatedSum}/{nativeSum}");
System.Console.Write($"readonly native-equivalent; generated={generatedBytes}; native={nativeBytes}");
double Generated() { return Tsonic.Generated.Index.observeNumeric(numeric) +
    Tsonic.Generated.Index.observeReference(reference).value + Tsonic.Generated.Index.observeNullable(nullable)!.value; }
double Native() { return NativeBaseline.Numeric(nativeNumeric) + NativeBaseline.Reference(nativeReference).value +
    NativeBaseline.Nullable(nativeNullable)!.value; }
interface INativeNumericBase { double value { get; } }
interface INativeNumericChild : INativeNumericBase { new int value { get; } }
sealed class NativeNumeric : INativeNumericChild {
    public int calls;
    public int value { get { calls++; return 7; } }
    double INativeNumericBase.value { get { return this.value; } }
}
class NativeBaseValue { public int value = 11; }
sealed class NativeDerivedValue : NativeBaseValue { public int extra = 13; }
interface INativeReferenceBase { NativeBaseValue value { get; } }
interface INativeReferenceChild : INativeReferenceBase { new NativeDerivedValue value { get; } }
sealed class NativeReference : INativeReferenceChild {
    public NativeDerivedValue value = new NativeDerivedValue();
    NativeDerivedValue INativeReferenceChild.value { get { return this.value; } }
    NativeBaseValue INativeReferenceBase.value { get { return this.value; } }
}
interface INativeNullableBase { NativeBaseValue? value { get; } }
interface INativeNullableChild : INativeNullableBase { new NativeDerivedValue? value { get; } }
sealed class NativeNullable : INativeNullableChild {
    public NativeDerivedValue? value;
    NativeDerivedValue? INativeNullableChild.value { get { return this.value; } }
    NativeBaseValue? INativeNullableBase.value { get { return this.value; } }
}
static class NativeBaseline {
    public static double Numeric(NativeNumeric body) { INativeNumericChild child = body; INativeNumericBase parent = child; return parent.value; }
    public static NativeBaseValue Reference(NativeReference body) { INativeReferenceChild child = body; INativeReferenceBase parent = child; return parent.value; }
    public static NativeBaseValue? Nullable(NativeNullable body) { INativeNullableChild child = body; INativeNullableBase parent = child; return parent.value; }
}`;

for (const surface of ["native", "js"]) {
  test(`inherited readonly native property obligations do not become internal failures (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: readonlySource });
    assert.equal(compiled.sourceDiagnosticsText, "", "every readonly/writable source relation is checked, not fabricated");
    assert.equal(compiled.result.diagnostics.length, 0,
      `native property admission: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/public int value = 7;/u.test(generated), true, "the native int32 backing is never widened to the base read type");
    assert.equal(/double ReadBase\.value/u.test(generated), true, "the true inherited native numeric obligation is emitted");
    assert.equal(/DerivedValue\?? value/u.test(generated), true, "reference backing retains its concrete selected native carrier");
    const captureRoot = new URL("../../../.temp/C19-structural-property-forwarding/", import.meta.url);
    mkdirSync(captureRoot, { recursive: true });
    writeFileSync(new URL(`${surface}.json`, captureRoot), JSON.stringify({ sourceText: readonlySource, nativeProgram: nativeObserver, artifacts: [...compiled.artifacts] }) + "\n");
    const output = executeCsharpConstruction(compiled, `C19-readonly-closure-${surface}`, false, false, [], nativeObserver);
    assert.equal(output, "readonly native-equivalent; generated=0; native=0",
      "complete native projects prove exact getter counts, identity, native absence, writable aliasing and zero extra allocation");
  });

  test(`writable structural widening refuses before any native artifacts are published (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `import type { int32 } from "@tsonic/core/types.js";
interface WritableView { value: number; }
class NarrowBody { value: int32 = 7; }
export function run(): number { const view: WritableView = new NarrowBody(); view.value = 1.5; return view.value; }` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the TypeScript-accepted writable relation requires a real native storage decision");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
      /^No exact C# implicit conversion relates /u.test(issue.message)), true,
    "the existing canonical conversion owner precisely refuses an unsound writable native relation");
    assert.equal(compiled.result.diagnostics.some(issue => String(issue.code).includes("INTERNAL")), false,
      "a reachable native limitation is never relabelled an internal invariant");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a rejected source never becomes a sealed program or planner input");
    assert.equal(compiled.artifacts.size, 0, "no source/native member is silently omitted from a partially published artifact");
  });
}
