import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/structural-implementation.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpVariantArgumentImplicitlyAccepts, namedTargetTypeImplicitlyAccepts } from "../../../dist/policy/conversions/carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const unexpectedNativeDispatchRead = () => assert.fail("this structural fixture has no authored native dispatch domain");

const emptyNativeDispatch = Object.freeze({
  names: Object.freeze({ resolve: unexpectedNativeDispatchRead }),
  storage: Object.freeze({ storageType: Object.freeze({ get: unexpectedNativeDispatchRead }) }),
  nativeUse: Object.freeze({ order: unexpectedNativeDispatchRead }),
  classPropertyStorage: Object.freeze({ get: unexpectedNativeDispatchRead }),
});

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

const number = Object.freeze({ kind: "source-primitive", name: "float64" });

const nativePolicy = { projectTypes: { directSupertypes: () => undefined }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };

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
  const policy = { ast: {}, target: {}, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
    projectTypes: { directSupertypes: () => [], catalog: { definitions: Object.freeze([]), definitionForDeclaration: () => undefined } },
    objectShapes: { resolveNode: () => undefined, resolveTarget() { shapeReads += 1; return undefined; } } };
  const shapes = { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]),
    structuralImplementations: () => Object.freeze([selected]), resolveTarget: () => undefined };
  const forbidden = () => assert.fail("property admission has no callable or default dependency");
  return { sourceNode, sourceType, property, selected, policy, shapes, reads: () => shapeReads,
    callables: { declarationContracts: Object.freeze([]), get: forbidden }, declarations: { runtimeDefault: { get: forbidden } },
    projections: { get: forbidden } };
}

function nativeVarianceFixture() {
  const parameter = Object.freeze({ kind: "type-parameter", identity: "view:Value", name: "Value" });
  const member = type => Object.freeze({ sourceKey: { kind: "property", name: "value" },
    sourceName: "value", targetName: "value", memberKind: "property", readonly: true, type });
  const target = arguments_ => csharpTargetNamedType("test.ReadView", arguments_, { kind: "named", name: "ReadView" },
    { structuralContract: true, allowsRefLikeTypeArguments: arguments_.map(() => false) });
  const base = csharpTargetNamedType("test.ReferenceBase", undefined, { kind: "named", name: "ReferenceBase" },
    { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [] });
  const derived = csharpTargetNamedType("test.ReferenceDerived", undefined, { kind: "named", name: "ReferenceDerived" },
    { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [] });
  const template = Object.freeze({ targetType: target([parameter]), members: [member(parameter)],
    covariantTypeParameterIdentities: Object.freeze([parameter.identity]) });
  const policy = { ...nativePolicy, projectTypes: { directSupertypes: type => type === derived ? [base] : undefined },
    objectShapes: { resolveNode: () => undefined, resolveTarget: type => type.id !== template.targetType.id ? undefined : {
      targetType: type, members: [member(type.typeArguments[0])], declarationTemplate: template,
    } } };
  return { parameter, member, target, base, derived, template, policy };
}

const covariantSource = `import type { int32 } from "@tsonic/core/types.js";
export class BaseValue { value: int32 = 7; }
export class DerivedValue extends BaseValue { extra: int32 = 11; }
export class Box<Value> { value: Value; constructor(value: Value) { this.value = value; } }
type Read<Value> = { readonly value: Value };
export function asRead(box: Box<DerivedValue>): Read<BaseValue> { return box; }
export function readNumber(box: Box<number>): number { const view: Read<number> = box; return view.value; }
`;

const covariantObserver = `
var value = new Tsonic.Generated.DerivedValue();
var box = new Tsonic.Generated.Box<Tsonic.Generated.DerivedValue>(value);
var view = Tsonic.Generated.Index.asRead(box);
if (!System.Object.ReferenceEquals(view, box) || !System.Object.ReferenceEquals(view.value, value))
    throw new System.Exception("native covariant interface and original backing identity");
var replacement = new Tsonic.Generated.DerivedValue(); box.value = replacement;
if (!System.Object.ReferenceEquals(view.value, replacement)) throw new System.Exception("native readonly alias observes actual writes");
if (Tsonic.Generated.Index.readNumber(new Tsonic.Generated.Box<double>(19)) != 19)
    throw new System.Exception("a second generic instantiation never inherits a fixed reference destination");
var nativeBox = new NativeBox<Tsonic.Generated.DerivedValue>(replacement);
INativeRead<Tsonic.Generated.BaseValue> nativeView = nativeBox;
if (!System.Object.ReferenceEquals(nativeView, nativeBox)) throw new System.Exception("native baseline covariance preserves backing identity");
for (int index = 0; index < 8192; index++) { _ = Tsonic.Generated.Index.asRead(box).value; _ = NativeAsRead(nativeBox).value; }
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread(); int generatedSum = 0;
for (int index = 0; index < 8192; index++) generatedSum += Tsonic.Generated.Index.asRead(box).value.value;
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread(); int nativeSum = 0;
for (int index = 0; index < 8192; index++) nativeSum += NativeAsRead(nativeBox).value.value;
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 8192 * 7 || nativeSum != generatedSum || generatedBytes != 0 || nativeBytes != 0)
    throw new System.Exception($"native covariance cost: {generatedSum}/{nativeSum}, bytes={generatedBytes}/{nativeBytes}");
System.Console.Write("native covariance identity; generated=0; native=0");
static INativeRead<Tsonic.Generated.BaseValue> NativeAsRead(NativeBox<Tsonic.Generated.DerivedValue> body) { return body; }
interface INativeRead<out Value> { Value value { get; } }
sealed class NativeBox<Value> : INativeRead<Value> { public Value value { get; } public NativeBox(Value value) { this.value = value; } }
`;

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
}
interface GenericRead<T> { readonly value: T; }
export function readGenericNumeric(): number { const value: GenericRead<number> = new ReadBody(); return value.value; }
export function readGenericNullable(): int32 | null { const value: GenericRead<int32 | null> = new ReadBody(); return value.value; }
export function readGenericReference(body: ReferenceBody): BaseValue { const value: GenericRead<BaseValue> = body; return value.value; }
export function readGenericNullableReference(body: NullableBody): BaseValue | null {
  const value: GenericRead<BaseValue | null> = body; return value.value;
}
interface MethodNumber { read(): number; }
export class DirectMethodBody implements MethodNumber {
  calls: int32 = 0;
  read(): int32 { this.calls += 1; return 7; }
}
export function observeMethod(body: DirectMethodBody): number { const value: MethodNumber = body; return value.read(); }
class MethodBaseBody { read(): int32 { return 13; } }
class InheritedMethodBody extends MethodBaseBody implements MethodNumber {}
export function readInheritedMethod(): number { const value: MethodNumber = new InheritedMethodBody(); return value.read(); }
interface ReferenceMethod { read(): BaseValue; }
export class ReferenceMethodBody implements ReferenceMethod {
  calls: int32 = 0;
  value: DerivedValue = new DerivedValue();
  read(): DerivedValue { this.calls += 1; return this.value; }
}
export function observeReferenceMethod(body: ReferenceMethodBody): BaseValue { const value: ReferenceMethod = body; return value.read(); }
interface DefaultNumber { read(value?: int32): number; }
let defaultMethodCalls: int32 = 0;
function nextMethodValue(): int32 { defaultMethodCalls += 1; return 37; }
class DefaultNumberBody implements DefaultNumber { read(value: int32 = nextMethodValue()): int32 { return value; } }
export function readDefaultMethod(): number { const value: DefaultNumber = new DefaultNumberBody(); return value.read() + defaultMethodCalls; }
interface GenericNumber { read<T>(): number; }
export class GenericNumberBody implements GenericNumber {
  calls: int32 = 0;
  read<Native>(): int32 { this.calls += 1; return 31; }
}
export function readGenericMethod(): number { const value: GenericNumber = new GenericNumberBody(); return value.read<string>(); }
export function observeGenericMethod(body: GenericNumberBody): number { const value: GenericNumber = body; return value.read<string>(); }
interface GenericResult<T> { read<Argument>(): T; }
class GenericResultBody { read<Native>(): int32 { return 41; } }
export function readGenericResult(): number { const value: GenericResult<number> = new GenericResultBody(); return value.read<string>(); }
interface PhantomNative { read<T>(value?: int32): int32; }
class PhantomNativeBody implements PhantomNative { read(value: int32 = 43): int32 { return value; } }
export function readPhantomNative(): int32 { const value: PhantomNative = new PhantomNativeBody(); return value.read<string>(); }
interface ConstrainedNumber { read<T extends BaseValue>(): number; }
class ConstrainedNumberBody implements ConstrainedNumber { read<Native extends BaseValue>(): int32 { return 47; } }
export function readConstrainedMethod(): number { const value: ConstrainedNumber = new ConstrainedNumberBody(); return value.read<DerivedValue>(); }
interface EqualBound { read<T extends BaseValue>(): int32; }
class EqualBoundBody implements EqualBound { read<Native extends BaseValue>(): int32 { return 67; } }
export function readEqualBound(): int32 { const value: EqualBound = new EqualBoundBody(); return value.read<BaseValue>(); }
interface WeakerBound { read<T extends DerivedValue>(): int32; }
class WeakerBoundBody implements WeakerBound { read<Native extends BaseValue>(): int32 { return 71; } }
export function readWeakerBound(): int32 { const value: WeakerBound = new WeakerBoundBody(); return value.read<DerivedValue>(); }
interface ClassBound { read<T extends BaseValue>(): int32; }
class ClassBoundBody implements ClassBound { read<Native extends object>(): int32 { return 73; } }
export function readClassBound(): int32 { const value: ClassBound = new ClassBoundBody(); return value.read<BaseValue>(); }
interface DependentBound { read<T extends BaseValue, Value extends T>(): int32; }
class DependentBoundBody implements DependentBound { read<Native extends BaseValue, Item extends Native>(): int32 { return 79; } }
export function readDependentBound(): int32 {
  const value: DependentBound = new DependentBoundBody(); return value.read<BaseValue, DerivedValue>();
}
interface ProjectedNumber { read<T>(value: T | undefined): number; }
class ProjectedNumberBody implements ProjectedNumber {
  read<Native>(value: Native | undefined): int32 { return value === undefined ? 83 : 89; }
}
export function readProjectedMethod(): number {
  const value: ProjectedNumber = new ProjectedNumberBody(); return value.read<string>(undefined) + value.read<string>("x");
}
interface ExactNative { echo<T>(value: T): T; }
class ExactNativeBody implements ExactNative { echo<Native>(value: Native): Native { return value; } }
export function readExactNative(): int32 { const value: ExactNative = new ExactNativeBody(); return value.echo<int32>(53); }
class CovariantBase { read(): BaseValue { return new BaseValue(); } }
class CovariantChild extends CovariantBase { override read(): DerivedValue { return new DerivedValue(); } }
export function readClassOverride(): BaseValue { const value: CovariantBase = new CovariantChild(); return value.read(); }
interface NamedGeneric { read<T>(T: T): number; }
class NamedGenericBody implements NamedGeneric { read<Native>(value: Native): int32 { return 59; } }
export function readNamedGeneric(): number { const value: NamedGeneric = new NamedGenericBody(); return value.read<string>("x"); }
interface KeywordMethod { read(event: int32): number; }
class KeywordMethodBody implements KeywordMethod { read(event: int32): int32 { return event; } }
export function readKeywordMethod(): number { const value: KeywordMethod = new KeywordMethodBody(); return value.read(61); }
`;

const nativeObserver = `
if (Tsonic.Generated.Index.readInherited() != 7) throw new System.Exception("inherited readonly native value");
if (Tsonic.Generated.Index.readGenericNumeric() != 7 || Tsonic.Generated.Index.readGenericNullable() != 7)
    throw new System.Exception("actual supplied readonly numeric and nullable generic arguments");
var method = new Tsonic.Generated.DirectMethodBody();
if (Tsonic.Generated.Index.observeMethod(method) != 7 || method.calls != 1 ||
    Tsonic.Generated.Index.readInheritedMethod() != 13 || Tsonic.Generated.Index.readDefaultMethod() != 38 ||
    Tsonic.Generated.Index.readGenericMethod() != 31 || Tsonic.Generated.Index.readGenericResult() != 41 ||
    Tsonic.Generated.Index.readPhantomNative() != 43 || Tsonic.Generated.Index.readConstrainedMethod() != 47 ||
    Tsonic.Generated.Index.readExactNative() != 53) throw new System.Exception("one canonical native method admission");
if (Tsonic.Generated.Index.readEqualBound() != 67 || Tsonic.Generated.Index.readWeakerBound() != 71 ||
    Tsonic.Generated.Index.readClassBound() != 73 || Tsonic.Generated.Index.readDependentBound() != 79)
    throw new System.Exception("actual generic invocation bounds and native implicit implementation eligibility");
if (Tsonic.Generated.Index.readProjectedMethod() != 172)
    throw new System.Exception("the exact real interface and body optional projection tails share native invocation evidence");
if (Tsonic.Generated.Index.readClassOverride().value != 11) throw new System.Exception("native class covariant override remains intact");
if (Tsonic.Generated.Index.readNamedGeneric() != 59 || Tsonic.Generated.Index.readKeywordMethod() != 61)
    throw new System.Exception("truthful native parameter names and generic binders remain hygienic");
var referenceMethod = new Tsonic.Generated.ReferenceMethodBody();
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.observeReferenceMethod(referenceMethod), referenceMethod.value) || referenceMethod.calls != 1)
    throw new System.Exception("method result covariance preserves native reference identity");
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
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.readGenericReference(reference), reference.value) ||
    Tsonic.Generated.Index.readGenericNullableReference(nullable) != null)
    throw new System.Exception("actual supplied readonly reference and nullable generic arguments");
if (Tsonic.Generated.Index.observeNullable(nullable) != null) throw new System.Exception("one native absence");
nullable.value = reference.value; nativeNullable.value = nativeReference.value;
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.observeNullable(nullable), reference.value))
    throw new System.Exception("nullable readonly reference identity");
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.readGenericNullableReference(nullable), reference.value))
    throw new System.Exception("generic nullable readonly reference identity");
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
var genericMethod = new Tsonic.Generated.GenericNumberBody();
var nativeMethod = new NativeMethod(); var nativeReferenceMethod = new NativeReferenceMethod(); var nativeGenericMethod = new NativeGenericMethod();
for (int index = 0; index < 8192; index++) { _ = GeneratedMethods(); _ = NativeMethods(); }
int methodCalls = method.calls, referenceMethodCalls = referenceMethod.calls, genericMethodCalls = genericMethod.calls;
int nativeMethodCalls = nativeMethod.calls, nativeReferenceMethodCalls = nativeReferenceMethod.calls, nativeGenericMethodCalls = nativeGenericMethod.calls;
long methodBefore = System.GC.GetAllocatedBytesForCurrentThread(); double methodSum = 0;
for (int index = 0; index < 8192; index++) methodSum += GeneratedMethods();
long methodBytes = System.GC.GetAllocatedBytesForCurrentThread() - methodBefore;
long nativeMethodBefore = System.GC.GetAllocatedBytesForCurrentThread(); double nativeMethodSum = 0;
for (int index = 0; index < 8192; index++) nativeMethodSum += NativeMethods();
long nativeMethodBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeMethodBefore;
if (methodSum != 8192 * 49.0 || nativeMethodSum != methodSum || methodBytes != 0 || nativeMethodBytes != 0 ||
    method.calls - methodCalls != 8192 || referenceMethod.calls - referenceMethodCalls != 8192 || genericMethod.calls - genericMethodCalls != 8192 ||
    nativeMethod.calls - nativeMethodCalls != 8192 || nativeReferenceMethod.calls - nativeReferenceMethodCalls != 8192 || nativeGenericMethod.calls - nativeGenericMethodCalls != 8192)
    throw new System.Exception($"native method cost/evaluation: bytes={methodBytes}/{nativeMethodBytes}, sum={methodSum}/{nativeMethodSum}");
System.Console.Write($"readonly native-equivalent; generated={generatedBytes}; native={nativeBytes}");
double Generated() { return Tsonic.Generated.Index.observeNumeric(numeric) +
    Tsonic.Generated.Index.observeReference(reference).value + Tsonic.Generated.Index.observeNullable(nullable)!.value; }
double Native() { return NativeBaseline.Numeric(nativeNumeric) + NativeBaseline.Reference(nativeReference).value +
    NativeBaseline.Nullable(nativeNullable)!.value; }
double GeneratedMethods() { return Tsonic.Generated.Index.observeMethod(method) +
    Tsonic.Generated.Index.observeReferenceMethod(referenceMethod).value + Tsonic.Generated.Index.observeGenericMethod(genericMethod); }
double NativeMethods() { return NativeBaseline.Method(nativeMethod) + NativeBaseline.ReferenceMethod(nativeReferenceMethod).value +
    NativeBaseline.GenericMethod(nativeGenericMethod); }
interface INativeNumericBase { double value { get; } }
interface INativeNumericChild : INativeNumericBase { new int value { get; } }
sealed class NativeNumeric : INativeNumericChild {
    public int calls;
    public int value { get { calls++; return 7; } }
    double INativeNumericBase.value { get { return this.value; } }
}
class NativeBaseValue { public int value = 11; }
sealed class NativeDerivedValue : NativeBaseValue { public int extra = 13; }
interface INativeMethod { double read(); }
sealed class NativeMethod : INativeMethod {
    public int calls;
    public int read() { calls++; return 7; }
    double INativeMethod.read() { return this.read(); }
}
interface INativeReferenceMethod { NativeBaseValue read(); }
sealed class NativeReferenceMethod : INativeReferenceMethod {
    public int calls; public NativeDerivedValue value = new NativeDerivedValue();
    public NativeDerivedValue read() { calls++; return value; }
    NativeBaseValue INativeReferenceMethod.read() { return this.read(); }
}
interface INativeGenericMethod { double read<T>(); }
sealed class NativeGenericMethod : INativeGenericMethod {
    public int calls;
    public int read<Native>() { calls++; return 31; }
    double INativeGenericMethod.read<T>() { return this.read<T>(); }
}
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
    public static double Method(NativeMethod body) { INativeMethod value = body; return value.read(); }
    public static NativeBaseValue ReferenceMethod(NativeReferenceMethod body) { INativeReferenceMethod value = body; return value.read(); }
    public static double GenericMethod(NativeGenericMethod body) { INativeGenericMethod value = body; return value.read<string>(); }
    public static double Numeric(NativeNumeric body) { INativeNumericChild child = body; INativeNumericBase parent = child; return parent.value; }
    public static NativeBaseValue Reference(NativeReference body) { INativeReferenceChild child = body; INativeReferenceBase parent = child; return parent.value; }
    public static NativeBaseValue? Nullable(NativeNullable body) { INativeNullableChild child = body; INativeNullableBase parent = child; return parent.value; }
}`;

export { unexpectedNativeDispatchRead, emptyNativeDispatch, integer, number, nativePolicy, propertyFixture, nativeVarianceFixture, covariantSource, covariantObserver, readonlySource, nativeObserver };
