import assert from "node:assert/strict";
import test from "node:test";
import { structuralMethodRestSource, receiverBoundMethodRestSource } from "../../../../tsonic/test/fixtures/structural-method-rest.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { admitCsharpDelegateEmission, selectCsharpNativeDelegateExtractions } from "../../../dist/analysis/conversions/callable-emission.js";
import { createCsharpDelegateContractProducer } from "../../../dist/analysis/program/records/callables/callable-conversions.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { substituteObjectShapeFactTargetTypeParameters, substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { planCsharpDelegateAdapter } from "../../../dist/backend/planner/expressions/callable-conversions.js";

test("declared structural method signatures retain their own fixed native contract without origin replay", () => {
  const declaration = Object.freeze({});
  const numberType = Object.freeze({ kind: "source-primitive", name: "float64" });
  const signature = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "run" }),
    sourceName: "run", targetName: "run", memberKind: "method", sourceDeclarations: Object.freeze([declaration]),
    type: csharpDelegateTargetType("System.Func", [numberType], numberType) });
  const field = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "removed" }),
    sourceName: "removed", targetName: "removed", memberKind: "property", type: numberType });
  const environment = () => assert.fail("the declared monomorphic method needs no inferred native binders");
  const sourceType = Object.freeze({});
  const targetType = createStructuralObjectShapeTarget([field, signature], undefined, environment, true);
  const protocols = [];
  const retain = shape => retainCsharpMethodValueContracts(shape, protocol => { protocols.push(protocol); }, environment);
  assert.equal(retainCsharpMethodValueContracts.length, 3,
    "the native method owner accepts declaration facts, not a history/origin/use-query input");
  const selected = retain({ targetType, sourceType, members: Object.freeze([field, signature]) });
  const method = selected.members[1];
  assert.equal(method.methodValueContract !== undefined && method.methodValueStorage === undefined, true,
    "a required method signature publishes an immutable native method, not a replaceable Func slot");
  assert.equal(selected.sourceType === sourceType && selected.members[0] === field, true,
    "native method selection preserves exact source and ordinary field identities");
  assert.equal(protocols.length === 1 && targetTypeRefEquals(protocols[0].targetType, method.methodValueContract), true,
    "the method owns exactly its complete invocation protocol");
  assert.equal((selected.implements ?? []).length === 0, true,
    "an abstract container returns the method handle without implementing that handle's physical body protocol");
  const repeated = retain(selected);
  assert.equal(protocols.length === 1 && targetTypeRefEquals(repeated.targetType, selected.targetType) &&
    targetTypeRefEquals(repeated.members[1].methodValueContract, method.methodValueContract), true,
  "repeated publication preserves the same method contract without another native protocol");
});

test("authored source methods retain their declaration contract without an origin-selected delegate layout", () => {
  const declaration = Object.freeze({});
  const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
  const member = Object.freeze({ sourceKey: { kind: "property", name: "run" }, sourceName: "run", targetName: "run",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [scalar], scalar),
    sourceDeclarations: [declaration], methodValueStorage: { kind: "delegate", type: csharpDelegateTargetType("System.Func", [scalar], scalar) } });
  const implementation = Object.freeze({ declaration, identity: "native-authored-run", methods: [declaration], captures: [] });
  const environment = () => assert.fail("the monomorphic body has no inferred quantifiers");
  const targetType = createStructuralObjectShapeTarget([member], undefined, environment, false, implementation);
  const protocols = [];
  const selected = retainCsharpMethodValueContracts({ targetType, members: [member], methodImplementation: implementation },
    protocol => { protocols.push(protocol); }, environment);
  assert.equal(selected.members[0].methodValueStorage === undefined && selected.members[0].methodValueContract !== undefined, true,
    "a checked authored METHOD cannot retain an origin-selected replaceable delegate slot");
  assert.equal(selected.methodImplementation === implementation && selected.members[0].sourceDeclarations[0] === declaration, true,
    "the selected immutable invocation preserves its exact original checked body and declaration");
  assert.equal(protocols.length === 1 && selected.implements.some(contract =>
    targetTypeRefEquals(contract, selected.members[0].methodValueContract)), true,
  "the physical native body implements the actual invocation contract without inventing write evidence");
});

test("native delegate extraction facts distinguish selected members, destinations and closed invocations", () => {
  const scalar = { kind: "source-primitive", name: "float64" };
  const text = { kind: "source-primitive", name: "string" };
  const parameter = { kind: "type-parameter", identity: "Value", name: "Value" };
  const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: signature, typeParameters: [{ declaration: {}, identity: "Value", name: "Value", constraints: [] }] };
  const protocol = createStructuralObjectShapeTarget([member], undefined, () => ({ kind: "resolved", constraints: [] }), true);
  const source = csharpMethodValueType(protocol, "__tsonic_invoke_body_identity", '["property","identity"]', signature, ["Value"]);
  assert.equal(source !== undefined, true, "the exact generic member owns its native callable carrier");
  const scalarTarget = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const textTarget = csharpDelegateTargetType("System.Func", [text], text);
  const namedTarget = csharpTargetNamedType("Fixture.Transform", undefined,
    { kind: "named", name: "Transform", usingNamespace: ["Fixture"] }, { allowsRefLikeTypeArguments: [],
      delegateSignature: { parameters: [scalar], parameterPassingModes: ["by-value"], returnType: scalar } });
  const producer = createCsharpDelegateContractProducer();
  const shape = { targetType: protocol, members: [{ ...member, methodValueContract: protocol }] };
  const shapes = { resolveTarget: owner => targetTypeRefEquals(owner, protocol) ? shape : undefined };
  for (const [target, argument] of [[scalarTarget, scalar], [textTarget, text], [namedTarget, scalar]]) {
    admitCsharpDelegateEmission(producer, source, target, { kind: "delegate-adapter", strategy: "native-binding",
      instantiation: { contract: csharpDelegateTargetType("System.Func", [argument], argument), typeArguments: [argument] },
      parameterConversions: [{ kind: "identity" }], returnConversion: { kind: "identity" } }, shapes);
  }
  producer.seal();
  const extractions = selectCsharpNativeDelegateExtractions(shape, shape.members[0], producer.records.delegateContract);
  assert.equal(extractions.length, 3, "one selected member retains each exact closed invocation/native destination");
  assert.equal(new Set(extractions.map(extraction => extraction.name)).size, 3,
    "distinct native destinations and closed invocations cannot alias the same cache slot");
  assert.equal(extractions.every(extraction => Object.isFrozen(extraction) && Object.isFrozen(extraction.methodTypeArguments)), true,
    "all selected extraction facts and actual method arguments are immutable before planning");
  assert.equal(selectCsharpNativeDelegateExtractions(shape, { ...shape.members[0],
    sourceKey: { kind: "property", name: "different" } }, producer.records.delegateContract).length, 0,
  "an equal-signature but distinct selected member owns no other member's extraction");
  assert.equal(selectCsharpNativeDelegateExtractions({ ...shape,
    targetType: { ...protocol, id: "Fixture.Foreign" } }, { ...shape.members[0], methodValueContract: undefined },
  producer.records.delegateContract).length, 0, "a foreign native handle cannot inherit an equal-signature extraction");
  assert.throws(() => admitCsharpDelegateEmission(producer, source,
    csharpDelegateTargetType("System.Func", [], scalar), { kind: "delegate-adapter", strategy: "native-binding",
      instantiation: { contract: scalarTarget, typeArguments: [scalar] }, parameterConversions: [], returnConversion: { kind: "identity" } }, shapes),
  /immutable after sealing/u, "the sealed owner does not accept later conversion or planner publication");
});

test("native method binding requires its sealed getter instead of falling back to per-read allocation", () => {
  const scalar = { kind: "source-primitive", name: "float64" };
  const signature = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const owner = csharpTargetNamedType("Fixture.NativeMethodOwner", undefined,
    { kind: "named", name: "NativeMethodOwner", usingNamespace: ["Fixture"] }, { allowsRefLikeTypeArguments: [] });
  const handle = csharpMethodValueType(owner, "run", "original-native-run", signature, []);
  assert.equal(handle !== undefined, true, "the exact monomorphic owner has its native method handle");
  const selection = { kind: "delegate-adapter", strategy: "native-binding",
    parameterConversions: [{ kind: "identity" }], returnConversion: { kind: "identity" } };
  const producer = createCsharpDelegateContractProducer();
  admitCsharpDelegateEmission(producer, handle, signature, selection, { resolveTarget: () => undefined });
  producer.seal();
  const contract = producer.records.delegateContract.get(handle, signature);
  assert.equal(contract.nativeExtraction !== undefined, true, "admission owns the completed exact getter");
  const receiver = { kind: "IdentifierName", name: "originalNativeOwner" };
  const diagnostics = [];
  const context = selected => ({ scope: {}, program: { records: { delegateContract: { get: () => selected } } } });
  const convert = () => assert.fail("an exact native binding performs no conversion or reconstruction");
  const actual = planCsharpDelegateAdapter({}, {}, context(contract), diagnostics, handle, signature,
    selection, receiver, convert);
  assert.equal(actual.kind === "SimpleMemberAccessExpression" && actual.receiver === receiver &&
    actual.name === contract.nativeExtraction.name, true, "planning consumes only the original owner's selected getter");
  for (const [source, selected] of [[handle, { ...contract, nativeExtraction: undefined }], [signature, contract]]) {
    assert.throws(() => planCsharpDelegateAdapter({}, {}, context(selected), diagnostics, source, signature,
      selection, receiver, convert), error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT",
    "a missing or foreign getter cannot silently choose the old delegate-allocation path");
  }
  assert.equal(diagnostics.length, 0, "a broken sealed record is an invariant, never a source refusal or hidden adapter");
});

test("generic native extraction retains declared binder roles when actual native arguments are equal", () => {
  const parameter = { kind: "type-parameter", identity: "Owner.Value", name: "Value" };
  const caller = { kind: "type-parameter", identity: "Caller.Input", name: "Input" };
  const text = { kind: "source-primitive", name: "string" };
  const member = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [parameter], text) };
  const protocol = createStructuralObjectShapeTarget([member], undefined, () => ({ kind: "resolved", constraints: [] }), true);
  const template = { targetType: protocol, members: [{ ...member, methodValueContract: protocol }] };
  const shapes = [template, ...[text, caller].map(argument => substituteObjectShapeFactTargetTypeParameters(template,
    new Map([[parameter.identity, argument]])))];
  assert.equal(shapes.every(shape => shape !== undefined), true, "each native owner uses its actual declared template substitution");
  const resolver = { resolveTarget: owner => shapes.find(shape => targetTypeRefEquals(shape.targetType, owner)) };
  const producer = createCsharpDelegateContractProducer();
  for (const argument of [text, caller]) {
    const bindings = new Map([[parameter.identity, argument]]);
    const owner = substituteTargetTypeParameters(protocol, bindings);
    const target = substituteTargetTypeParameters(member.type, bindings);
    const source = csharpMethodValueType(owner, "__tsonic_invoke_body_read", '["property","read"]', target, []);
    assert.equal(source !== undefined, true, "the selected method signature is bound to that exact native owner");
    admitCsharpDelegateEmission(producer, source, target, { kind: "delegate-adapter", strategy: "native-binding",
      parameterConversions: [{ kind: "identity" }], returnConversion: { kind: "identity" } }, resolver);
  }
  producer.seal();
  const facts = producer.records.delegateContract.nativeExtractions();
  assert.equal(facts.length === 2 && facts[0].name === facts[1].name, true,
    "closed and alpha-renamed caller owners use the same declaration-owned native getter");
  assert.equal(facts.every(fact => targetTypeRefEquals(fact.owner, protocol) &&
    fact.targetCarrier.typeArguments[0] === parameter && fact.targetCarrier.typeArguments[1] === text &&
    fact.sourceSignature.parameters[0] === parameter && fact.sourceSignature.returnType === text), true,
  "a native parameter remains its own binder while a coincidentally equal fixed string result stays fixed");
  for (const shape of shapes) {
    const selected = selectCsharpNativeDelegateExtractions(shape, shape.members[0], producer.records.delegateContract);
    assert.equal(selected.length === 1 && targetTypeRefEquals(selected[0].owner, shape.targetType) &&
      targetTypeRefEquals(selected[0].targetCarrier, shape.members[0].type), true,
    "each actual native declaration receives one precisely instantiated getter, not a caller-scope type parameter");
  }
  const closed = shapes[1];
  const source = csharpMethodValueType(closed.targetType, "__tsonic_invoke_body_read", '["property","read"]', closed.members[0].type, []);
  assert.throws(() => admitCsharpDelegateEmission(createCsharpDelegateContractProducer(), source, closed.members[0].type,
    { kind: "delegate-adapter", strategy: "native-binding", parameterConversions: [{ kind: "identity" }],
      returnConversion: { kind: "identity" } }, { resolveTarget: () => undefined }), /exact checked owner declaration template/u,
  "missing generic declaration evidence cannot be replaced with an inverse guess from equal primitive values");
});

const storedCallableSource = `
export interface StoredCallable {
  removed: number;
  run: (value: number) => number;
}
export function make(): StoredCallable {
  return { removed: 3, run: (value: number): number => value + 7 };
}
export function copy(value: StoredCallable): { run: (value: number) => number } {
  const { removed, ...rest } = value;
  return rest;
}
export function replace(value: { run: (value: number) => number }, replacement: (value: number) => number): void {
  value.run = replacement;
}
export function run(): boolean {
  const source = make();
  const first = copy(source);
  const second = copy(source);
  return first !== second && first.run === source.run && second.run === source.run &&
    first.run(2) === 9 && second.run(3) === 10;
}
`;

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";

  test(`native Func extraction stays on the original handle through copies on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Methods = { extra: number; run(value: number): number; other(value: number): number };
export function make(seed: number): Methods {
  return { extra: seed, run(value: number): number { return this.extra + value; },
    other(value: number): number { return this.extra - value; } };
}
export function extract(value: Methods): (input: number) => number { return value.run; }
export function extractOther(value: Methods): (input: number) => number { return value.other; }
export function copy(value: Methods): Methods { return { ...value }; }
export function run(): boolean {
  const value = make(4);
  return extract(value)(3) === 7 && extractOther(value)(3) === 1 && copy(value).run(2) === 6;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `stable-native-delegate-${profile}`, false, false, [], `
for (int index = 0; index < 4096; index++) {
    _ = Tsonic.Generated.Index.extract(Tsonic.Generated.Index.make(4));
    _ = new NativeDelegateOwner(4).Extract();
}
var original = Tsonic.Generated.Index.make(4);
var native = new NativeDelegateOwner(4);
long before = System.GC.GetAllocatedBytesForCurrentThread();
var first = Tsonic.Generated.Index.extract(original);
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var baseline = native.Extract();
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (nativeBytes <= 0 || generatedBytes != nativeBytes)
    throw new System.Exception($"first native delegate allocation {generatedBytes}/{nativeBytes}");
var copied = Tsonic.Generated.Index.copy(original);
before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 4096; index++) {
    if (!object.ReferenceEquals(first, Tsonic.Generated.Index.extract(original)) ||
        !object.ReferenceEquals(first, Tsonic.Generated.Index.extract(copied)))
        throw new System.Exception("same original native delegate through copies");
}
long repeatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (repeatedBytes != 0) throw new System.Exception($"repeated/copy extraction {repeatedBytes}");
if (object.ReferenceEquals(first, Tsonic.Generated.Index.extract(Tsonic.Generated.Index.make(4))) ||
    object.ReferenceEquals(first, Tsonic.Generated.Index.extractOther(original)))
    throw new System.Exception("distinct native handles and members");
copied.extra = 90;
original.extra = 11;
if (first(3) != 14 || Tsonic.Generated.Index.extract(copied)(3) != 14 || copied.extra != 90 ||
    !Tsonic.Generated.Index.run()) throw new System.Exception("original native receiver and copied fields");
System.GC.KeepAlive(baseline);
System.Console.Write($"first={generatedBytes};native={nativeBytes};repeated={repeatedBytes}");
sealed class NativeDelegateOwner {
    private readonly double extra;
    private System.Func<double, double>? value;
    public NativeDelegateOwner(double extra) { this.extra = extra; }
    public double Run(double input) => extra + input;
    public System.Func<double, double> Extract() => value ??= Run;
}
`);
    assert.match(output, /^first=\d+;native=\d+;repeated=0$/u,
      "first extraction matches native allocation and repeated/copied extraction adds none");
    console.log(`stable native delegate ${profile}: ${output}`);
  });

  test(`closed generic native Func extraction retains each original invocation on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Generic = { identity<Value>(value: Value): Value };
export function make(): Generic { return { identity<Value>(value: Value): Value { return value; } }; }
export function extractNumber(value: Generic): (input: number) => number { return value.identity; }
export function extractText(value: Generic): (input: string) => string { return value.identity; }
export function copy(value: Generic): Generic { return { ...value }; }
export function run(): boolean {
  const value = make();
  return extractNumber(value)(3) === 3 && extractText(value)("native") === "native";
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `stable-generic-delegate-${profile}`, false, false, [], `
var original = Tsonic.Generated.Index.make();
var copied = Tsonic.Generated.Index.copy(original);
var number = Tsonic.Generated.Index.extractNumber(original);
var text = Tsonic.Generated.Index.extractText(original);
if (!object.ReferenceEquals(number, Tsonic.Generated.Index.extractNumber(original)) ||
    !object.ReferenceEquals(number, Tsonic.Generated.Index.extractNumber(copied)) ||
    !object.ReferenceEquals(text, Tsonic.Generated.Index.extractText(copied)) ||
    object.ReferenceEquals(number, text) || number(7) != 7 || text("identity") != "identity" ||
    !Tsonic.Generated.Index.run()) throw new System.Exception("closed generic native delegate identity");
`);
  });

  test(`captured generic native Func extraction retains its actual body handle on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Generic = <Value>(value: Value) => Value;
export function make(seed: number): Generic {
  return function identity<Value>(value: Value): Value {
    if (seed < 0) throw new Error("negative seed");
    return value;
  };
}
export function extract(value: Generic): (input: number) => number { return value; }
export function run(): boolean { return extract(make(1))(7) === 7; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `stable-captured-generic-${profile}`, false, false, [], `
var original = Tsonic.Generated.Index.make(1);
var alias = original;
var first = Tsonic.Generated.Index.extract(original);
if (!object.ReferenceEquals(first, Tsonic.Generated.Index.extract(alias)) ||
    object.ReferenceEquals(first, Tsonic.Generated.Index.extract(Tsonic.Generated.Index.make(2))) ||
    first(9) != 9 || !Tsonic.Generated.Index.run())
    throw new System.Exception("captured generic native body identity");
`);
  });

  test(`generic owner native Func extraction retains its own native type argument on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
interface Box<Value> { value: Value; read(): Value; }
export function make<Value>(value: Value): Box<Value> {
  return { value, read(): Value { return this.value; } };
}
export function extract<Value>(value: Box<Value>): () => Value { return value.read; }
export function copy<Value>(value: Box<Value>): Box<Value> { return { ...value }; }
export function run(): boolean {
  const value = make("native");
  return extract(value)() === "native" && extract(copy(value))() === "native";
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `stable-generic-owner-${profile}`, false, false, [], `
var original = Tsonic.Generated.Index.make("native");
var copied = Tsonic.Generated.Index.copy(original);
var first = Tsonic.Generated.Index.extract(original);
if (!object.ReferenceEquals(first, Tsonic.Generated.Index.extract(original)) ||
    !object.ReferenceEquals(first, Tsonic.Generated.Index.extract(copied)) ||
    first() != "native" || !Tsonic.Generated.Index.run())
    throw new System.Exception("generic owner native extraction type and identity");
`);
  });

  test(`copied method correspondence retains the original reordered rest identities on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: structuralMethodRestSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
    const bodies = compiled.result.program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    const methods = bodies.flatMap(shape => shape.members.filter(member => member.sourceName === "run"));
    assert.equal(methods.length >= 2 && methods.every(member => member.methodValueContract !== undefined &&
      member.methodValueStorage === undefined && targetTypeRefEquals(member.methodValueContract, methods[0].methodValueContract)), true,
    "both reordered authored methods retain the same exact immutable native invocation contract");
    assert.equal(/\bdouble run\(double (?:arg0|value)\)/u.test(output), true,
      "ordinary copied calls retain the exact declared native double method ABI");
    assert.equal(/\brequired Func<double, double>/u.test(output), false,
      "method syntax does not become a replaceable native delegate field");
    assert.equal(/CreateDynamicObject|ReadDynamicSlot|WriteDynamicSlot|System\.Reflection/u.test(output), false,
      "native rest correspondence adds no dynamic member or reflection mechanism");
    executeCsharpConstruction(compiled, `copied-method-correspondence-${profile}`);
  });

  test(`copied native method handles retain identity and native allocation cost on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Contract = { removed: number; run(value: number): number };
export function create() {
  return { extra: "extra", removed: 3, run(value: number): number { return value + 7; } };
}
export function copy(value: Contract): { run(value: number): number } {
  const { removed, ...rest } = value;
  return rest;
}
export function same(left: { run(value: number): number }, right: { run(value: number): number }): boolean {
  return left.run === right.run;
}
export function run(): boolean {
  const source = create();
  const first = copy(source);
  const second = copy(source);
  return first !== second && same(source, first) && same(first, second) && first.run(2) === 9 && second.run(3) === 10;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `copied-native-method-${profile}`, false, false, [], `
var source = Tsonic.Generated.Index.create();
var first = Tsonic.Generated.Index.copy(source);
var second = Tsonic.Generated.Index.copy(source);
if (object.ReferenceEquals(first, second) || !Tsonic.Generated.Index.same(source, first) ||
    !Tsonic.Generated.Index.same(first, second) || first.run(2) != 9 || second.run(3) != 10)
    throw new System.Exception("copied native method handle identity and invocation");
var native = new NativeMethod();
for (int index = 0; index < 4096; index++) {
    _ = Tsonic.Generated.Index.copy(source).run(1);
    _ = NativeCopy.Create(native).Run(1);
}
object keep = first;
double checksum = 0;
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) {
    var value = Tsonic.Generated.Index.copy(source);
    checksum += value.run(1);
    keep = value;
}
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) {
    var value = NativeCopy.Create(native);
    checksum -= value.Run(1);
    keep = value;
}
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (checksum != 0 || nativeBytes <= 0 || generatedBytes > nativeBytes)
    throw new System.Exception($"native method rest allocation {generatedBytes}/{nativeBytes}/{checksum}");
System.GC.KeepAlive(source);
System.GC.KeepAlive(keep);
System.Console.Write($"generated={generatedBytes};native={nativeBytes}");
sealed class NativeMethod {
    public double Run(double value) => value + 7;
}
sealed class NativeCopy {
    private readonly NativeMethod method;
    private NativeCopy(NativeMethod method) { this.method = method; }
    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    public static NativeCopy Create(NativeMethod method) => new NativeCopy(method);
    public double Run(double value) => method.Run(value);
}
`);
    assert.match(output, /^generated=\d+;native=\d+$/u, "native method rest allocation is measured without extra adaptation");
    console.log(`native method rest ${profile}: ${output}`);
  });

  test(`copied method correspondence preserves the original receiver-bound refusal on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: receiverBoundMethodRestSource });
    assert.equal(compiled.sourceDiagnosticsText, "", "the receiver control remains valid checked source");
    assert.equal(compiled.artifacts.size, 0, "a receiver-dependent copied contract publishes no artifacts");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
      issue.message.includes("copied method-value contract")), true,
    "a copy cannot silently bind the method to the original source receiver");
  });

  test(`copied function-property storage retains identity and native allocation cost on ${profile}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: storedCallableSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `copied-function-property-${profile}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("stored callable copy identity");
var original = Tsonic.Generated.Index.make();
var first = Tsonic.Generated.Index.copy(original);
var second = Tsonic.Generated.Index.copy(original);
if (object.ReferenceEquals(first, second) || !object.ReferenceEquals(first.run, original.run) ||
    !object.ReferenceEquals(second.run, original.run) || first.run(2) != 9.0)
    throw new System.Exception("native copies retain the exact stored delegate without rebinding");
for (int index = 0; index < 4096; index++)
{
    System.GC.KeepAlive(Tsonic.Generated.Index.copy(original));
    System.GC.KeepAlive(NativeRestCopy.Create(original.run));
}
long beforeGenerated = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) System.GC.KeepAlive(Tsonic.Generated.Index.copy(original));
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - beforeGenerated;
long beforeNative = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) System.GC.KeepAlive(NativeRestCopy.Create(original.run));
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - beforeNative;
if (nativeBytes <= 0 || generatedBytes > nativeBytes)
    throw new System.Exception($"native rest allocation: generated={generatedBytes}, native={nativeBytes}");
var retained = original.run;
Tsonic.Generated.Index.replace(first, value => value + 13);
if (object.ReferenceEquals(first.run, retained) || !object.ReferenceEquals(original.run, retained) ||
    !object.ReferenceEquals(second.run, retained) || first.run(2) != 15 || retained(2) != 9)
    throw new System.Exception("copied function properties retain their distinct replaceable native slots");
Tsonic.Generated.Index.replace(original, value => value + 17);
if (original.run(2) != 19 || second.run(2) != 9 || retained(2) != 9 || first.run(2) != 15)
    throw new System.Exception("property replacement preserves earlier native delegate snapshots and independent copies");
System.Console.WriteLine($"generatedBytes={generatedBytes};nativeBytes={nativeBytes}");

sealed class NativeRestCopy
{
    public readonly System.Func<double, double> run;
    private NativeRestCopy(System.Func<double, double> value) { run = value; }
    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    public static NativeRestCopy Create(System.Func<double, double> value) { return new NativeRestCopy(value); }
}
`);
  });
}
