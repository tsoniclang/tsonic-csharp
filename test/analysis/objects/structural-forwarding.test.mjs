import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpDelegateTargetType, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
const unexpectedNativeDispatchRead = () => assert.fail("this structural fixture has no authored native dispatch domain");
const emptyNativeDispatch = Object.freeze({
  names: Object.freeze({ resolve: unexpectedNativeDispatchRead }),
  storage: Object.freeze({ storageType: Object.freeze({ get: unexpectedNativeDispatchRead }) }),
  nativeUse: Object.freeze({ order: unexpectedNativeDispatchRead }),
  classPropertyStorage: Object.freeze({ get: unexpectedNativeDispatchRead }),
});
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/structural-implementation.js";
import { planCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/declarations/interfaces/structural.js";
import { analyzeCsharpStructuralInterfaceEmission } from "../../../dist/analysis/declarations/structural-interfaces.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { printCsharpCompilationUnit } from "../../../dist/print/source/index.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { instantiateCsharpInheritedCallable } from "../../../dist/analysis/callables/generics/instantiation.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../../../dist/analysis/objects/structural-forwarding.js";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { csharpCopiedObjectShapeMembers } from "../../../dist/policy/types/objects/method-environments.js";
import { selectCsharpObjectMethodImplementation } from "../../../dist/analysis/objects/shapes/method-implementations.js";
import { selectCsharpObjectMemberEmission } from "../../../dist/policy/types/objects/object-members.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const noAuthoredNativeMethod = Object.freeze({
  memberSubjectFor: () => assert.fail("an abstract protocol has no authored native slot"),
  memberWritesFor: () => assert.fail("an abstract protocol has no authored native writes"),
});

test("a single native method contract and its extracted protocol publish the same canonical shape", () => {
  const member = Object.freeze({ sourceKey: { kind: "property", name: "run" }, sourceName: "run",
    targetName: "run", memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer) });
  const environment = () => assert.fail("a monomorphic protocol has no native constraint query");
  const targetType = createStructuralObjectShapeTarget([member], undefined, environment, true);
  const remember = () => assert.fail("an existing method contract cannot allocate or register a second self protocol");
  const logical = retainCsharpMethodValueContracts({ targetType, members: Object.freeze([member]) }, remember, environment,
    noAuthoredNativeMethod);
  const physical = retainCsharpMethodValueContracts({ targetType,
    members: Object.freeze([{ ...member, methodValueContract: targetType }]) }, remember, environment, noAuthoredNativeMethod);
  assert.equal(targetTypeRefKey(logical.members[0].methodValueContract), targetTypeRefKey(targetType),
    "the logical contract already owns its actual self protocol");
  assert.equal(targetTypeRefKey(physical.members[0].methodValueContract), targetTypeRefKey(targetType),
    "extracting the same method cannot publish a contradictory missing-versus-present protocol");
  assert.equal(logical.implements === undefined && physical.implements === undefined, true,
    "canonical self identity never manufactures native self inheritance");
});

test("an authored method supplying a selected native delegate field does not invent a native method carrier", () => {
  const declaration = Object.freeze({});
  const member = Object.freeze({ sourceKey: { kind: "property", name: "run" }, sourceName: "run",
    targetName: "run", memberKind: "property", sourceDeclarations: Object.freeze([declaration]),
    type: csharpDelegateTargetType("System.Func", [integer], integer) });
  const selected = selectCsharpObjectMethodImplementation(Object.freeze([member]), {
    ast: { is: { IsMethodDeclaration: () => assert.fail("the selected native field is not reclassified by source spelling") } },
    objectMethodSources: { get: () => assert.fail("a native delegate field must not demand a second method environment") },
  }, { depth: 0 });
  assert.equal(selected === undefined, true, "the actual native field keeps its canonical delegate initializer contract");
});

for (const surface of ["native", "js"]) test(`${surface}: native class delegate fields retain their authored object initializer`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
class HandlerBox { run: (value: int32) => int32 = (value) => value; }
function make(): HandlerBox { return { run(value: int32): int32 { return value + 1; } }; }
export function run(): boolean { const handler = make(); return handler.run(6) === 7; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /HandlerBox make\(\)/u, "the selected native class owns the returned storage");
    assert.match(emitted, /new HandlerBox/u, "a method-shaped source initializer does not invent an unrelated native object carrier");
    executeCsharpConstruction(compiled, `native-class-delegate-initializer-${surface}`);
  });

for (const surface of ["native", "js"]) test(`${surface}: selected method slots cache one native extraction and preserve rest receivers`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
type Payload = { extra: int32; run(value: int32): int32 };
export function make(extra: int32): Payload { return { extra, run(value: int32): int32 { return this.extra + value; } }; }
export function call(value: Payload, input: int32): int32 { return value.run(input); }
export function extract(value: Payload): (input: int32) => int32 { return value.run; }
export function copy(value: Payload): Payload { return { ...value }; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `selected-method-native-cost-${surface}`, false, false, [], `
var warm = Tsonic.Generated.Index.make(4);
var nativeWarm = new NativeMethod(4);
for (int index = 0; index < 4096; index++) {
    _ = Tsonic.Generated.Index.call(warm, 7);
    _ = Tsonic.Generated.Index.extract(warm);
    _ = nativeWarm.Run(7);
    _ = nativeWarm.Extract();
}
var value = Tsonic.Generated.Index.make(4);
var native = new NativeMethod(4);
long before = System.GC.GetAllocatedBytesForCurrentThread();
int checksum = 0;
for (int index = 0; index < 4096; index++) checksum += Tsonic.Generated.Index.call(value, 7);
long direct = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 4096; index++) checksum -= native.Run(7);
long nativeDirect = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var first = Tsonic.Generated.Index.extract(value);
long extraction = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var nativeFirst = native.Extract();
long nativeExtraction = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 4096; index++)
    if (!object.ReferenceEquals(first, Tsonic.Generated.Index.extract(value))) throw new System.Exception("extraction identity");
long repeated = System.GC.GetAllocatedBytesForCurrentThread() - before;
var copy = Tsonic.Generated.Index.copy(value);
before = System.GC.GetAllocatedBytesForCurrentThread();
var copied = Tsonic.Generated.Index.extract(copy);
long copiedExtraction = System.GC.GetAllocatedBytesForCurrentThread() - before;
copy.extra = 90;
value.extra = 11;
if (!object.ReferenceEquals(first, copied) || first(3) != 14 || Tsonic.Generated.Index.call(copy, 3) != 14 || copy.extra != 90)
    throw new System.Exception("rest preserves the original callable, receiver and body");
if (direct != 0 || nativeDirect != 0 || extraction <= 0 || extraction != nativeExtraction || repeated != 0 || copiedExtraction != 0 || checksum != 0)
    throw new System.Exception($"native allocation mismatch {direct}/{nativeDirect}/{extraction}/{nativeExtraction}/{repeated}/{copiedExtraction}/{checksum}");
System.Console.Write($"direct={direct};first={extraction};nativeFirst={nativeExtraction};repeat={repeated};copy={copiedExtraction}");
System.GC.KeepAlive(nativeFirst);
sealed class NativeMethod {
    private readonly int extra;
    private System.Func<int, int>? value;
    public NativeMethod(int extra) { this.extra = extra; }
    public int Run(int input) => extra + input;
    public System.Func<int, int> Extract() => value ??= Run;
}
`);
    assert.equal(/^direct=0;first=\d+;nativeFirst=\d+;repeat=0;copy=0$/u.test(output), true,
      "native execution measures one baseline-sized cached delegate, no direct-call/repeated-read allocation and exact copied identity");
    process.stdout.write(`${surface}: ${output}\n`);
  });

test("a physical method protocol retains checked source and generic declaration provenance when completed", () => {
  const targetType = Object.freeze({ kind: "target-named", id: "tsonic.shape:checked-method-protocol",
    csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  const sourceType = Object.freeze({});
  const declaration = Object.freeze({});
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }),
    sourceName: "read", targetName: "read", memberKind: "method",
    type: csharpDelegateTargetType("System.Func", [integer], integer) });
  const template = Object.freeze({ targetType, sourceType, members: Object.freeze([member]) });
  const protocol = Object.freeze({ targetType, members: Object.freeze([member]) });
  const checked = Object.freeze({ targetType, sourceType, declarationTemplate: template,
    members: Object.freeze([{ ...member, sourceDeclarations: Object.freeze([declaration]) }]) });
  for (const [label, left, right] of [["protocol first", protocol, checked], ["checked first", checked, protocol]]) {
    const merged = mergeCsharpObjectShapeSubjects(left, right);
    assert.equal(merged.sourceType === sourceType, true, `${label}: checked correspondence cannot disappear behind physical interning`);
    assert.equal(merged.declarationTemplate === template, true, `${label}: the genuine generic declaration remains authoritative`);
    assert.equal(merged.members[0].sourceDeclarations.length === 1 &&
      merged.members[0].sourceDeclarations[0] === declaration, true, `${label}: the exact selected declaration is retained`);
    assert.equal(merged.targetType === targetType, true, `${label}: native identity and representation do not change`);
  }
});

test("every actual authored native method uses the same body and copy protocol", () => {
  const declaration = Object.freeze({});
  const literal = Object.freeze({});
  const targetType = Object.freeze({ kind: "target-named", id: "tsonic.shape:authored-body",
    csharpAllowsRefLikeTypeArguments: Object.freeze([]), csharpRender: Object.freeze({ kind: "named", name: "AuthoredBody" }) });
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }), sourceName: "read",
    targetName: "read", memberKind: "method", type: csharpDelegateTargetType("System.Func", [], integer),
    sourceDeclarations: Object.freeze([declaration]) });
  const implementation = Object.freeze({ declaration: literal, identity: "authored-body", methods: Object.freeze([declaration]),
    captures: Object.freeze([]) });
  const environment = () => assert.fail("a monomorphic native method has no free generic constraint to resolve");
  const subject = Object.freeze({ node: declaration });
  const sourceStorage = Object.freeze({
    memberSubjectFor: node => {
      assert.equal(node === declaration, true, "the native owner queries the exact authored method slot");
      return Object.freeze({ kind: "resolved", subject });
    },
    memberWritesFor: selected => {
      assert.equal(selected === subject, true, "the proof covers the canonical physical slot, not a spelling");
      return Object.freeze({ kind: "open", writes: Object.freeze([]),
        boundaries: Object.freeze([{ kind: "external-write", subject, exposure: literal }]) });
    },
  });
  const admitted = retainCsharpMethodValueContracts({ targetType, members: Object.freeze([member]),
    methodImplementation: implementation }, shape => shape, environment, sourceStorage);
  assert.equal(admitted.methodImplementation === implementation, true, "native body and checked capture identity are retained");
  assert.equal(admitted.members[0].methodValueContract !== undefined, true, "an ordinary native body gets the existing method protocol");
  assert.equal(admitted.members[0].methodValueStorage === undefined, true, "the native body does not introduce a delegate storage field");
  assert.equal(csharpCopiedObjectShapeMembers(admitted)[0].methodValueStorage.type === targetType, true,
    "a copy retains the actual original native environment");
  const selectedContract = admitted.members[0].methodValueContract;
  const unimplemented = retainCsharpMethodValueContracts({ targetType,
    members: Object.freeze([{ ...member, methodValueContract: selectedContract }]) }, shape => shape, environment,
    noAuthoredNativeMethod);
  assert.equal(unimplemented.members[0].methodValueContract === selectedContract, true,
    "an abstract method retains its actual selected native invocation contract independently of unrelated object fields");
  assert.equal(unimplemented.methodImplementation === undefined && unimplemented.members[0].methodValueStorage === undefined, true,
    "an abstract invocation contract never manufactures an authored native body or writable slot");
  const unselected = retainCsharpMethodValueContracts({ targetType, members: Object.freeze([member]) }, shape => shape, environment,
    noAuthoredNativeMethod);
  assert.equal(unselected.members[0].methodValueContract === undefined, true,
    "an absent body is not evidence of a selected native invocation contract");
  for (const [label, selection] of [
    ["complete readonly slot", { kind: "complete", writes: [] }],
    ["open without an exposure proof", { kind: "open", writes: [], boundaries: [] }],
    ["actual replacement", { kind: "complete", writes: [{ kind: "mutation" }] }],
    ["same-value write", { kind: "open", writes: [{ kind: "mutation", value: subject }],
      boundaries: [{ kind: "external-write", subject, exposure: literal }] }],
    ["opaque native effect", { kind: "open", writes: [],
      boundaries: [{ kind: "opaque-write", subject, exposure: literal }] }],
    ["external input", { kind: "open", writes: [],
      boundaries: [{ kind: "external-input", subject, exposure: literal }] }],
    ["unclassified exposure", { kind: "open", writes: [],
      boundaries: [{ kind: "unclassified-exposure", subject, exposure: literal }] }],
    ["missing write proof", { kind: "unresolved", reason: "exact writes unavailable" }],
  ]) {
    const selected = retainCsharpMethodValueContracts({ targetType, members: Object.freeze([member]),
      methodImplementation: implementation }, shape => shape, environment, {
        ...sourceStorage, memberWritesFor: () => selection,
      });
    assert.equal(selected.members[0].methodValueContract !== undefined, label === "complete readonly slot",
      `${label}: only the actual immutable native method contract removes delegate storage`);
    assert.equal(selected.members[0].methodValueStorage === undefined, label === "complete readonly slot",
      `${label}: every actual or unproved write keeps one closed callable-value slot`);
    if (label !== "complete readonly slot") assert.equal(targetTypeRefKey(selected.members[0].methodValueStorage.type), targetTypeRefKey(member.type),
      `${label}: stored values retain the closed native delegate, never an extra synthetic self parameter`);
    assert.equal(selected.methodImplementation === implementation, true, `${label}: source body and capture identity remain`);
  }
});

test("authored bodies admit only exact closed delegate or optional protocol slots", () => {
  const declaration = Object.freeze({});
  const type = csharpDelegateTargetType("System.Func", [], integer);
  const targetType = csharpTargetNamedType("ClosedMethodBody", [], { kind: "named", name: "ClosedMethodBody" },
    { allowsRefLikeTypeArguments: [] });
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }), sourceName: "read",
    targetName: "read", memberKind: "method", type, sourceDeclarations: Object.freeze([declaration]) });
  const shape = Object.freeze({ targetType, members: Object.freeze([member]) });
  const select = (selected, receiverBound = false) => selectCsharpObjectMemberEmission({ shape: { ...shape, members: [selected] },
    member: selected, receiverBound, authored: true, deferred: false, implementsInterface: false, nativeField: undefined });
  const fixed = select(member);
  assert.equal(fixed.kind === "selected" && fixed.value.declaration.kind === "authored" &&
    fixed.value.declaration.value.kind === "fixed", true, "the native fixed body has no callable slot");
  const closed = select({ ...member, methodValueStorage: { kind: "delegate", type } });
  assert.equal(closed.kind === "selected" && closed.value.declaration.kind === "authored" &&
    closed.value.declaration.value.kind === "delegate", true, "the mutable monomorphic value uses its exact closed delegate");
  const selectedMember = Object.freeze({ ...member, methodValueStorage: Object.freeze({ kind: "delegate", type }) });
  const retained = retainCsharpMethodValueContracts({ ...shape, members: [selectedMember],
    methodImplementation: { declaration, methods: [declaration], captures: [], identity: "selected-native-delegate" } },
    () => assert.fail("a selected native delegate cannot invent a second method protocol"),
    () => assert.fail("the selected monomorphic delegate has no generic constraint"), {
      memberSubjectFor: () => assert.fail("an already-selected delegate is not reclassified from method mutation evidence"),
    });
  assert.equal(retained.members[0] === selectedMember, true,
    "the exact required native delegate slot remains authoritative even for a fixed authored method");
  for (const [label, stored] of [
    ["synthetic self parameter", csharpDelegateTargetType("System.Func", [targetType], integer)],
    ["wrong result", csharpDelegateTargetType("System.Func", [], { kind: "source-primitive", name: "string" })],
    ["unproved absence", csharpNullableTargetType(type)],
  ]) assert.equal(select({ ...member, methodValueStorage: { kind: "delegate", type: stored } }).kind, "rejected", `${label}: mismatched physical storage is refused before publication`);
  assert.equal(select({ ...member, methodValueStorage: { kind: "delegate", type } }, true).kind, "rejected",
    "an independent open-receiver mismatch cannot be relabelled as a native body");
  const protocol = csharpTargetNamedType("OptionalMethodProtocol", [], { kind: "named", name: "OptionalMethodProtocol" },
    { structuralContract: true, allowsRefLikeTypeArguments: [] });
  const optional = select({ ...member, optional: true, methodValueContract: protocol,
    methodValueStorage: { kind: "protocol", type: csharpNullableTargetType(protocol), invocationName: "__tsonic_invoke_body_read" } });
  assert.equal(optional.kind === "selected" && optional.value.declaration.kind === "authored" &&
    optional.value.declaration.value.kind === "protocol" && optional.value.declaration.value.initializedName !== undefined, true,
    "a written optional absence has its own state, never a null-coalescing resurrection");
  assert.equal(select({ ...member, optional: true, methodValueContract: protocol,
    methodValueStorage: { kind: "protocol", type: protocol, invocationName: "__tsonic_invoke_body_read" } }).kind, "rejected",
    "a present-only field cannot silently erase optional callable absence");
  assert.equal(select({ ...member, optional: true, methodValueContract: protocol,
    methodValueStorage: { kind: "protocol", type: csharpNullableTargetType(protocol), invocationName: "read" } }).kind, "rejected",
    "a stored body cannot dispatch through its later current-value method");
});

for (const surface of ["native", "js"]) {
  for (const [name, action, fixed] of [
    ["exported readonly method", "return value;", true],
    ["source alias replacement", "const alias = value; alias.read = () => 11; return value;", false],
    ["same-value alias write", "const alias = value; alias.read = value.read; return value;", false],
  ]) test(`${surface}: ${name} retains its actual native exposure and checked writes`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export function make(seed: int32) {
  const value = { count: seed, read(): int32 { return this.count; } };
  ${action}
}
export function run(): boolean { return make(7).read() === ${name === "source alias replacement" ? 11 : 7}; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const shapes = program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    assert.equal(shapes.length > 0, true, `${name}: the actual native object implementation is published`);
    const members = shapes.flatMap(shape => shape.members.filter(member => member.sourceName === "read"));
    assert.equal(members.length > 0 && members.every(member => (member.methodValueContract !== undefined) === fixed), true,
      `${name}: native method selection follows the original physical slot writes, not source syntax alone`);
    assert.equal(members.every(member => (member.methodValueStorage === undefined) === fixed), true,
      `${name}: a mutable native body is not mistaken for a fixed public method`);
    const bodies = shapes.flatMap(shape => program.records.objectMethods.get(shape) ?? []);
    assert.equal(bodies.length > 0 && bodies.every(body => (body.emission.value.kind === "fixed") === fixed), true,
      `${name}: one sealed body and callable-value decision drives all native consumers`);
    executeCsharpConstruction(compiled, `native-method-exposure-${surface}-${name.replaceAll(" ", "-")}`);
  });
  test(`${surface}: a fixed native method retains extraction, receiver alias and capture identity`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
function make(seed: int32) {
  return { count: seed, read(): int32 { return this.count; } };
}
export function run(): boolean {
  const value = make(7);
  const alias = value;
  const first = value.read;
  const second = alias.read;
  alias.count = 11;
  return first === second && first() === 11 && value.read() === 11;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-method-extraction-${surface}`);
  });
}

test("a native rest-copy layout stores the required invocation protocol without inventing a body", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const signature = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "run" }),
    sourceName: "run", targetName: "run", memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer) });
  const selectedContract = createStructuralObjectShapeTarget([signature], undefined,
    () => assert.fail("the selected monomorphic protocol has no free native binder"), true);
  const schema = Object.freeze({ targetType: Object.freeze({ kind: "target-named", id: "tsonic.shape:rest-schema",
    csharpGeneratedStructuralStorage: true, csharpAllowsRefLikeTypeArguments: Object.freeze([]) }),
    members: Object.freeze([Object.freeze({ ...signature, methodValueContract: selectedContract })]) });
  const policy = createCsharpObjectShapePolicy({
    typeParameterConstraints: () => assert.fail("the monomorphic rest layout has no free native binder"),
    ast: { is: {} }, sourceStorage: noAuthoredNativeMethod,
  });
  const copy = policy.resolveCopyShape(schema);
  assert.equal(copy !== undefined && copy !== schema, true, "a generated rest schema receives one materializable native copy layout");
  const member = copy.members[0];
  assert.equal(member.methodValueContract !== undefined && member.methodValueStorage?.kind === "protocol" &&
    targetTypeRefEquals(member.methodValueStorage.type, member.methodValueContract), true,
  "the rest field stores the original input's exact selected native invocation contract, never a CLR delegate adaptation");
  assert.equal(member.methodValueContract === selectedContract, true, "copying retains the actual published input contract identity");
  assert.equal(copy.methodImplementation === undefined, true, "copying an abstract field never manufactures an authored source body");
  const unselected = policy.resolveCopyShape({ ...schema, members: [signature] });
  assert.equal(unselected.members[0].methodValueContract === undefined, true,
    "an absent body alone cannot invent a native protocol for an ordinary monomorphic callable field");
});

test("a raw interface copy admits its method protocol before selecting native storage", () => {
  const declaration = Object.freeze({});
  const parameter = Object.freeze({ kind: "type-parameter", identity: "interface.read.Value", name: "Value",
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });
  const shape = Object.freeze({ targetType: Object.freeze({ kind: "target-named", id: "tsonic.source:Reader",
    csharpSourceDeclarationKind: "interface", csharpAllowsRefLikeTypeArguments: Object.freeze([]) }),
  members: Object.freeze([Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }), sourceName: "read",
    targetName: "read", memberKind: "method", type: csharpDelegateTargetType("System.Func", [parameter], parameter),
    typeParameters: Object.freeze([Object.freeze({ declaration, identity: parameter.identity, name: parameter.name,
      csharpAllowsRefLike: false, constraints: Object.freeze([]) })]) })]) });
  const policy = createCsharpObjectShapePolicy({
    typeParameterConstraints: () => assert.fail("method-local binders never become copy-owner generic parameters"),
    ast: { is: {} },
  });
  const copied = policy.resolveCopyShape(shape);
  assert.equal(copied !== undefined && copied !== shape, true, "the interface has one physical copy representation");
  assert.equal(copied.members[0].methodValueContract !== undefined &&
    copied.members[0].methodValueStorage.type === copied.members[0].methodValueContract, true,
  "the copied generic method retains an admitted native environment instead of an unrenderable open delegate");
  assert.equal(copied.members[0].typeParameters[0].identity === parameter.identity, true,
    "the real generic method binder is unchanged");
  const nativeClass = Object.freeze({ targetType: Object.freeze({ kind: "target-named", id: "tsonic.source:NativeBody",
    csharpSourceDeclarationKind: "class", csharpAllowsRefLikeTypeArguments: Object.freeze([]) }), members: Object.freeze([]) });
  const admittedView = Object.freeze({ ...nativeClass, implements: Object.freeze([shape.targetType]) });
  assert.equal(policy.resolveCopyShape(nativeClass) === nativeClass && policy.resolveCopyShape(admittedView) === admittedView, true,
    "a non-copying native class retains the analysis-owned interface view without policy re-registration or arbitration");
});

test("a genuine native callable self-instantiation retains its complete projected binder vector", () => {
  const declaration = Object.freeze({});
  const parameter = Object.freeze({ kind: "type-parameter", identity: "actual:Value", name: "Value" });
  const storage = csharpNullableTargetType(parameter);
  const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [parameter] });
  const identities = Object.freeze([parameter.identity, operations.identity, storage.identity]);
  const permissions = Object.freeze([false, false, false]);
  const incoming = Object.freeze({ sourceParameter: Object.freeze({}),
    targetParameter: Object.freeze({ name: "value", type: storage, passingMode: "by-value" }) });
  const contract = sourceContract({ sourceDeclaration: declaration, nativeSignature: { methodTypeParameterIdentities: identities,
    methodAllowsRefLikeTypeArguments: permissions }, nativeParameters: Object.freeze([incoming]), returnType: integer });
  const policy = { ast: { typeParameters: () => assert.fail("self-instantiation cannot confuse authored slots with its native projection vector") },
    projectTypes: { instantiateMemberType(selected, _receiver, type) {
      assert.equal(selected === declaration, true, "the actual declaration is the native instantiation owner");
      return { kind: "resolved", type };
    } } };
  const selected = instantiateCsharpInheritedCallable(policy, contract, contract, undefined);
  assert.equal(selected !== undefined, true, "one authored binder plus two real projections is a valid self-instantiation");
  assert.equal(selected.nativeSignature.methodTypeParameterIdentities === identities && selected.nativeSignature.methodAllowsRefLikeTypeArguments === permissions, true,
    "the exact canonical native binder and permission vectors are retained, never reconstructed or defaulted");
  assert.equal(selected.nativeParameters[0].targetParameter.type === storage, true, "the real optional storage identity is retained");
});

test("native callable alpha substitution preserves selected bounded parameter metadata", () => {
  const sourceFile = { path: "/source/bounded.ts" };
  const sourceParameter = { name: "Source", position: 10 };
  const implementationParameter = { name: "Native", position: 20 };
  const sourceDeclaration = { parameters: [sourceParameter] };
  const implementationDeclaration = { parameters: [implementationParameter] };
  const ast = {
    is: { IsTypeParameterDeclaration: node => node === sourceParameter || node === implementationParameter },
    typeParameters: node => node.parameters,
    name: node => node.name, text: name => name, getSourceFile: () => sourceFile, getPath: file => file.path,
    kind: () => 22, pos: node => node.position, end: node => node.position + 5,
  };
  const constraint = Object.freeze({ kind: "resolved", constraints: Object.freeze([{ kind: "keyword", keyword: "class" }]) });
  const sourceType = Object.freeze({ ...csharpSourceTypeParameter(sourceParameter, ast), csharpConstraints: constraint });
  const implementationType = Object.freeze({ ...csharpSourceTypeParameter(implementationParameter, ast), csharpConstraints: constraint });
  const contract = (declaration, parameter) => sourceContract({ sourceDeclaration: declaration,
    nativeSignature: { methodTypeParameterIdentities: Object.freeze([parameter.identity]), methodAllowsRefLikeTypeArguments: Object.freeze([false]) },
    nativeParameters: Object.freeze([{ sourceParameter: Object.freeze({}), targetParameter: Object.freeze({ name: "value",
      type: csharpNullableTargetType(parameter), passingMode: "by-value" }) }]), returnType: parameter });
  const implementation = contract(implementationDeclaration, implementationType);
  const selected = instantiateCsharpInheritedCallable({ ast, projectTypes: {
    instantiateMemberType: (_declaration, _receiver, type) => ({ kind: "resolved", type }),
  } }, contract(sourceDeclaration, sourceType), implementation, undefined);
  assert.equal(selected !== undefined, true, "the actual bounded generic callable can be alpha-instantiated");
  assert.equal(selected.nativeParameters[0].targetParameter.type.csharpNullableReference === true &&
    selected.nativeParameters[0].targetParameter.type.csharpProjection === undefined, true,
  "substituting an actual class-bound binder never creates an unknown optional witness");
  assert.equal(selected.nativeParameters[0].targetParameter.type.csharpConstraints === constraint &&
    selected.returnType.identity === implementationType.identity, true, "native identity and selected constraints remain authoritative");
});

test("distinct authored callable binders preserve a matching complete native projection layout", () => {
  const sourceFile = { path: "/source/projected.ts" };
  const sourceParameter = { name: "Source", position: 10 };
  const implementationParameter = { name: "Native", position: 20 };
  const sourceDeclaration = { parameters: [sourceParameter] };
  const implementationDeclaration = { parameters: [implementationParameter] };
  const ast = {
    is: { IsTypeParameterDeclaration: node => node === sourceParameter || node === implementationParameter },
    typeParameters: node => node.parameters,
    name: node => node.name, text: name => name, getSourceFile: () => sourceFile, getPath: file => file.path,
    kind: () => 22, pos: node => node.position, end: node => node.position + 5,
  };
  const contract = (declaration, parameter) => {
    const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [parameter] });
    const storage = csharpNullableTargetType(parameter);
    return sourceContract({ sourceDeclaration: declaration,
      nativeSignature: { methodTypeParameterIdentities: Object.freeze([parameter.identity, operations.identity, storage.identity]),
      methodAllowsRefLikeTypeArguments: Object.freeze([false, false, false]) },
      nativeParameters: Object.freeze([{ sourceParameter: Object.freeze({}), targetParameter: Object.freeze({
        name: "value", type: storage, passingMode: "by-value", optional: true }) }]), returnType: integer });
  };
  const source = contract(sourceDeclaration, csharpSourceTypeParameter(sourceParameter, ast));
  const implementation = contract(implementationDeclaration, csharpSourceTypeParameter(implementationParameter, ast));
  const selected = instantiateCsharpInheritedCallable({ ast, projectTypes: {
    instantiateMemberType: (_declaration, _receiver, type) => ({ kind: "resolved", type }),
  } }, source, implementation, undefined);
  assert.equal(selected !== undefined, true, "one actual authored binder aligns without truncating the three native binders");
  assert.equal(selected.nativeSignature.methodTypeParameterIdentities === implementation.nativeSignature.methodTypeParameterIdentities &&
    selected.nativeSignature.methodAllowsRefLikeTypeArguments === implementation.nativeSignature.methodAllowsRefLikeTypeArguments, true,
  "the actual complete native binder and permission vectors remain authoritative");
  assert.equal(targetTypeRefKey(selected.nativeParameters[0].targetParameter.type) ===
    targetTypeRefKey(implementation.nativeParameters[0].targetParameter.type), true,
  "the real projected storage is substituted through its checked authored payload");
  assert.equal(selected.nativeParameters[0].sourceParameter === source.nativeParameters[0].sourceParameter &&
    selected.nativeParameters[0].targetParameter.optional === true && selected.nativeParameters[0].targetParameter.passingMode === "by-value", true,
  "parameter identity, omission and native passing are unchanged");
});

function defaultEvidenceFixture(kind) {
  const declaration = Object.freeze({ kind });
  const sourceSymbol = Object.freeze({});
  const destinationSymbol = Object.freeze({});
  const sourceType = Object.freeze({});
  const destinationType = Object.freeze({});
  const method = type => Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type });
  const sourceMember = Object.freeze({ ...method(csharpDelegateTargetType("System.Func", [integer], integer)),
    sourceSubjects: [sourceSymbol] });
  const destinationMember = Object.freeze({ ...method(csharpDelegateTargetType("System.Func", [csharpNullableTargetType(integer)], integer,
    { optionalParameterIndexes: [0] })), sourceSubjects: [destinationSymbol] });
  const source = Object.freeze({ targetType: { kind: "target-named", id: "test.Source", csharpAllowsRefLikeTypeArguments: Object.freeze([]) }, members: [sourceMember] });
  const destination = Object.freeze({ targetType: { kind: "target-named", id: "test.View", csharpSourceDeclarationKind: "interface", csharpAllowsRefLikeTypeArguments: Object.freeze([]) },
    sourceType: destinationType, members: [destinationMember] });
  let parameterReads = 0;
  const parameter = Object.freeze({});
  const policy = {
    projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget: () => undefined } },
    semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers(_source, _destination, purpose) {
      assert.equal(purpose, "read", "native method forwarding requires readable source members");
      return { kind: "available",
      destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol: sourceSymbol, rootSymbols: [] }, declarations: [declaration] },
        destination: { property: { symbol: destinationSymbol, rootSymbols: [] }, declarations: [] },
      }],
      };
    } } }),
    ast: {
      is: { IsMethodDeclaration: node => node.kind === "method-declaration",
        IsMethodSignatureDeclaration: node => node.kind === "method-signature" },
      parameters(node) {
        parameterReads += 1;
        assert.equal(node === declaration, true, "defaults read from the selected declaration only");
        assert.notEqual(node.kind, "property-declaration", "property declarations have no method parameter list");
        return [parameter];
      },
      as: { AsParameterDeclaration: node => node === parameter ? { Initializer: {} } : undefined },
    },
  };
  return { policy, source, destination, parameterReads: () => parameterReads };
}

test("structural correspondence never reads parameters from a selected property declaration", () => {
  const value = defaultEvidenceFixture("property-declaration");
  value.policy.ast.parameters = () => assert.fail("a callable member symbol cannot make a property declaration a method");
  const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination);
  assert.equal(selected === undefined, true, "a property cannot supply a method-default witness");
  assert.equal(value.parameterReads(), 0, "the actual declaration kind gates source parameter reads");
});

for (const kind of ["method-declaration", "method-signature"]) {
  test(`structural correspondence retains a selected ${kind} without duplicating the default owner`, () => {
    const value = defaultEvidenceFixture(kind);
    const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination);
    assert.equal(selected === undefined, false, "the selected method reaches the single canonical native admission");
    assert.equal(value.parameterReads(), 0, "logical correspondence never reparses canonical runtime defaults");
    assert.equal(selected.methods.length, 1, "one native method correspondence");
    assert.equal(Object.hasOwn(selected.methods[0], "defaultArguments"), false,
      "the obsolete competing default decision is absent; canonical forwarding retains the exact default contract");
  });
}

test("structural destination retains a supplied outer argument absent from every method value type", () => {
  const outer = Object.freeze({ kind: "type-parameter", identity: "view:Outer", name: "Outer" });
  const sourceOuter = Object.freeze({ kind: "type-parameter", identity: "body:Outer", name: "Outer" });
  const methodParameter = Object.freeze({ declaration: {}, identity: "view:read:T", name: "T", csharpAllowsRefLike: false,
    constraints: Object.freeze([{ kind: "type", type: outer }]) });
  const member = type => Object.freeze({ sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type });
  const read = member(csharpDelegateTargetType("System.Func", [integer], integer));
  const openWrite = Object.freeze({ ...member(csharpDelegateTargetType("System.Func", [csharpNullableTargetType(integer)], integer,
    { optionalParameterIndexes: [0] })), typeParameters: Object.freeze([methodParameter]) });
  const body = argument => csharpTargetNamedType("test.GenericBody", [argument], { kind: "named", name: "GenericBody" },
    { allowsRefLikeTypeArguments: [false] });
  const view = argument => csharpTargetNamedType("test.GenericView", [argument], { kind: "named", name: "GenericView" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [false] });
  const template = Object.freeze({ targetType: body(sourceOuter), members: Object.freeze([read]) });
  const destinationTemplate = Object.freeze({ targetType: view(outer), members: Object.freeze([openWrite]) });
  const source = Object.freeze({ targetType: body(integer), members: template.members, declarationTemplate: template });
  const destination = Object.freeze({ targetType: view(integer), members: destinationTemplate.members, declarationTemplate: destinationTemplate });
  const selected = selectCsharpStructuralInterfaceImplementation({ projectTypes: { directSupertypes: () => undefined },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } }, { sourceNode: {}, source, destination, declaredSupertypes: [], members: [{ source: read, destination: openWrite,
    openSource: read, openDestination: openWrite, declaration: {} }] });
  assert.equal(selected !== undefined, true, "the selected closed destination supplies its actual otherwise-uninferable owner argument");
  assert.equal(selected.interfaceType.typeArguments[0] === integer, true, "no phantom argument is guessed from the nongeneric implementation");
  assert.equal(selected.methods[0].member.typeParameters[0].constraints[0].type === integer, true,
    "the same selected substitution closes the destination method's outer constraint");
  assert.equal(selected.sourceType === template.targetType, true, "the source's own generic declaration remains authoritative");
});

test("canonical member substitution preserves method shadowing while closing outer constraints and stored contracts", () => {
  const outer = Object.freeze({ kind: "type-parameter", identity: "owner:T", name: "T" });
  const local = Object.freeze({ kind: "type-parameter", identity: "method:T", name: "T" });
  const stored = csharpDelegateTargetType("System.Func", [outer], outer);
  const member = Object.freeze({ sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read", memberKind: "method",
    type: csharpDelegateTargetType("System.Func", [local, outer], local), methodValueStorage: { kind: "delegate", type: stored }, methodValueContract: stored,
    typeParameters: Object.freeze([{ declaration: {}, identity: local.identity, name: local.name, csharpAllowsRefLike: false,
      constraints: Object.freeze([{ kind: "type", type: outer }]) }]) });
  const selected = substituteObjectShapeMemberTargetTypeParameters(member,
    new Map([[outer.identity, integer], [local.identity, { kind: "source-primitive", name: "string" }]]));
  const signature = getCsharpDelegateSignature(selected.type);
  assert.equal(signature.parameters[0] === local && signature.returnType === local, true, "the method's own binder shadows same-named owner substitutions");
  assert.equal(signature.parameters[1] === integer, true, "the distinct outer owner argument is substituted");
  assert.equal(selected.typeParameters[0].constraints[0].type === integer, true, "the outer constraint is closed through the same helper");
  for (const [field, type] of [["methodValueStorage", selected.methodValueStorage.type], ["methodValueContract", selected.methodValueContract]]) {
    const contract = getCsharpDelegateSignature(type);
    assert.equal(contract.parameters[0] === integer && contract.returnType === integer, true, `${field}: the selected physical contract is closed`);
  }
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.typeParameters) && Object.isFrozen(selected.typeParameters[0].constraints), true,
    "one immutable substituted member is published");
});

test("structural publication closes late inherited obligations through its single existing implementation graph", () => {
  const makeShape = (name, declarationKind) => Object.freeze({
    targetType: csharpTargetNamedType(`test.${name}`, undefined, { kind: "named", name },
      { sourceDeclarationKind: declarationKind, allowsRefLikeTypeArguments: [] }),
    sourceType: Object.freeze({}), members: [Object.freeze({ sourceKey: { kind: "property", name: "value" },
      sourceName: "value", targetName: "value", memberKind: "property", type: integer, sourceSubjects: [Object.freeze({})] })],
  });
  const body = makeShape("Body", "class"), view = makeShape("View", "interface"), base = makeShape("Base", "interface");
  const shapes = [body, view, base];
  let correspondenceReads = 0;
  const policy = {
    sourceFiles: [], objectShapes: {
      resolveTarget: type => shapes.find(shape => targetTypeRefKey(shape.targetType) === targetTypeRefKey(type)),
      resolveCopyShape: shape => shape,
    }, projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget: () => undefined } },
    semanticsFor: () => ({ types: { structuralMembers(source, destination, purpose) {
      assert.equal(purpose, "read", "inherited native implementations require readable source members");
      correspondenceReads += 1;
      const sourceShape = shapes.find(shape => shape.sourceType === source);
      const destinationShape = shapes.find(shape => shape.sourceType === destination);
      assert.equal(sourceShape !== undefined && destinationShape !== undefined, true, "both checked source identities are retained");
      return { kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol: sourceShape.members[0].sourceSubjects[0], rootSymbols: [] }, declarations: [] },
        destination: { property: { symbol: destinationShape.members[0].sourceSubjects[0], rootSymbols: [] }, declarations: [] },
      }] };
    } } }),
  };
  const analyzed = analyzeCsharpObjectShapes(policy, { targetTypes: [] }, {});
  assert.equal(analyzed.registerStructuralInterface({}, body.targetType, view.targetType, body.sourceType), true, "the original checked body/view edge");
  assert.equal(analyzed.registerStructuralInterface({}, view.targetType, base.targetType, view.sourceType), true, "a later native base obligation");
  const published = analyzed.knownShapes().find(shape => shape.targetType === body.targetType);
  assert.equal(published.implements.length, 2, "both native interface obligations are closed before publication");
  assert.equal(analyzed.structuralImplementations(body.targetType).some(selected => selected.interfaceType === base.targetType), true,
    "the late inherited interface has its own exact sealed-forwarding input");
  const closedReads = correspondenceReads;
  analyzed.knownShapes();
  assert.equal(correspondenceReads, closedReads, "an unchanged implementation graph never redecides correspondence");
});

// The planner reads structural forwarding from records.structuralInterface, which the analysis publishes with the
// selected method binder names. The fixture's single structural shape has no lifted outer binders or projections.
function structuralInterfaceRecords(objectShapes, sourceType) {
  return analyzeCsharpStructuralInterfaceEmission({ ast: {},
    shapes: { knownShapes: () => [{ targetType: sourceType }], structuralImplementations: type => objectShapes.structuralImplementations(type) },
    names: { typeParameterNames: [] }, projectTypes: { definitionContainingDeclaration: () => undefined },
    projections: { genericProjection: { get: () => [] } }, declarations: { methodWrite: { get: () => undefined } } });
}

function sourceContract(input) {
  return Object.freeze({ ...input, kind: "source", nativeSignature: Object.freeze(input.nativeSignature),
    parameters: Object.freeze(input.nativeParameters.map(parameter => parameter.sourceParameter)) });
}

function fixture(passingMode = "by-value") {
  const sourceType = Object.freeze({ kind: "target-named", id: "test.Source", csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  const interfaceType = Object.freeze({ kind: "target-named", id: "test.View", csharpRender: { kind: "named", name: "View" }, csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  const declaration = Object.freeze({});
  const sourceParameter = Object.freeze({});
  const incoming = Object.freeze({ name: "value", type: passingMode === "by-value" ? csharpNullableTargetType(integer) : integer,
    passingMode, ...(passingMode === "by-value" ? { optional: true } : {}) });
  const implementation = sourceContract({ sourceDeclaration: declaration, nativeSignature: { methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]) },
    nativeParameters: Object.freeze([Object.freeze({ sourceParameter, targetParameter: incoming })]), returnType: integer });
  const signature = csharpDelegateTargetType("System.Func", [incoming.type], integer,
    passingMode === "by-value" ? { optionalParameterIndexes: [0] } : {});
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type: {
    ...signature, csharpDelegateSignature: { ...signature.csharpDelegateSignature, parameterPassingModes: Object.freeze([passingMode]) },
  } });
  const selected = Object.freeze({ sourceNode: declaration, sourceType, interfaceType, properties: Object.freeze([]), methods: Object.freeze([
    Object.freeze({ sourceName: "read", declaration, member }),
  ]) });
  const runtimeDefault = Object.freeze({ kind: "nullable", valueType: integer, parameterType: incoming.type, acceptsOmission: true });
  let reads = 0;
  const callables = { declarationContracts: Object.freeze([]), get(identity) { reads += 1;
    return identity.declaration === declaration ? implementation : undefined; } };
  const declarations = { runtimeDefault: { get(node) { reads += 1;
    return node === sourceParameter && passingMode === "by-value" ? runtimeDefault : undefined; } } };
  const policy = { ast: { parent: () => undefined, parameters: () => assert.fail("source parameter analysis cannot run again") },
    projectTypes: { catalog: { definitions: Object.freeze([]), definitionForDeclaration: () => undefined, definitionForTarget: () => undefined }, directSupertypes: () => [] },
    objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }),
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
  const shapes = { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]),
    structuralImplementations: () => Object.freeze([selected]), knownShapes: () => [], resolveTarget: () => undefined };
  return { sourceType, declaration, sourceParameter, implementation, runtimeDefault, callables, declarations, policy, shapes,
    projections: { get: () => Object.freeze([]) }, reads: () => reads };
}

test("structural method admission rejects every unrenderable selected native signature slot before publication", () => {
  const value = fixture();
  const admittedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(admittedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const admitted = admittedResult.value;
  assert.equal(admitted.issues.length, 0, "the complete unmodified native forwarding contract is admitted");
  const selected = admitted.objectShapes.structuralImplementations(value.sourceType)[0];
  const original = selected.methods[0];
  const opaque = Object.freeze({ kind: "opaque", id: "unrenderable-selected-native-slot" });
  for (const slot of ["interface", "return", "parameter", "incoming", "type argument"]) {
    const contract = slot === "return" ? { ...original.forwarding.contract, returnType: opaque }
      : slot === "parameter" ? { ...original.forwarding.contract, nativeParameters: original.forwarding.contract.nativeParameters.map(parameter =>
        ({ ...parameter, targetParameter: { ...parameter.targetParameter, type: opaque } })) } : original.forwarding.contract;
    const implementation = slot === "incoming" ? { ...original.forwarding.implementation,
      nativeParameters: original.forwarding.implementation.nativeParameters.map(parameter =>
        ({ ...parameter, targetParameter: { ...parameter.targetParameter, type: opaque } })) } : original.forwarding.implementation;
    const method = { ...original, forwarding: { ...original.forwarding, contract, implementation,
      ...(slot === "type argument" ? { typeArguments: Object.freeze([opaque]) } : {}) } };
    const checked = finalizeCsharpStructuralInterfaceForwarding(value.policy,
      { ...selected, ...(slot === "interface" ? { interfaceType: opaque } : {}) }, [method]);
    assert.equal(checked.issues.length === 1 && checked.issues[0].node === original.declaration &&
      checked.issues[0].code === "CSHARP_UNSUPPORTED_AST" &&
      checked.issues[0].message === "An analyzed interface method has no exact native forwarding signature.", true,
    `${slot}: the actual selected native slot is refused at admission, not mislabeled as an internal failure`);
    assert.equal(checked.implementation.methods.length, 0, `${slot}: no partially renderable method enters the sealed graph`);
  }
});

test("structural forwarding publishes canonical completed contracts and pure immutable native reads", () => {
  const value = fixture();
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 0, "the canonical incoming native ABI is admitted");
  const selected = finalized.objectShapes.structuralImplementations(value.sourceType);
  const method = selected[0]?.methods[0];
  assert.equal(method?.forwarding.implementation === value.implementation, true, "the canonical physical contract is reused, not rebuilt");
  assert.equal(method?.forwarding.parameterDefaults[0] === value.runtimeDefault, true, "the existing default owner is reused by exact parameter identity");
  assert.equal(method?.forwarding.parameters[0]?.kind, "value", "native incoming values forward directly");
  assert.equal(method?.forwarding.parameters[0]?.adapter.conversion.kind, "identity", "no boxing or default evaluation adapter");
  assert.equal(Object.isFrozen(method.forwarding) && Object.isFrozen(method.forwarding.parameters) && Object.isFrozen(selected), true,
    "the final native view is immutable");
  assert.equal(Object.hasOwn(finalized.objectShapes, "structuralImplementationTypes"), false, "analysis-only demand inventory does not cross the program seal");
  const reads = value.reads();
  value.callables.get = () => assert.fail("canonical ABI lookup cannot be repeated after publication");
  value.declarations.runtimeDefault.get = () => assert.fail("runtime default lookup cannot be repeated after publication");
  value.shapes.structuralImplementations = () => assert.fail("logical structural selection cannot run after publication");
  assert.equal(finalized.objectShapes.structuralImplementations({ ...value.sourceType }) === selected, true, "final reader preserves native record identity");
  assert.equal(value.reads(), reads, "the final getter is a lookup only");
  assert.throws(() => finalized.objectShapes.structuralImplementations({ ...value.sourceType, typeArguments: [integer] }),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.source === "tsonic-csharp" &&
      error.message === "C# structural forwarding has no sealed record for the selected native instantiation.",
    "an impossible unadmitted generic instantiation uses the canonical analysis invariant and cannot trigger late analysis");
});

test("the complete interface request union is deduplicated before native admission or default lookup", () => {
  const value = fixture();
  const selected = value.shapes.structuralImplementations(value.sourceType)[0];
  value.shapes.structuralImplementations = () => [selected, { ...selected, methods: [...selected.methods] }];
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 0, "identical checked obligations are not competing source constraints");
  const admitted = finalized.objectShapes.structuralImplementations(value.sourceType);
  assert.equal(admitted.length === 1 && admitted[0].methods.length === 1, true, "one native owner/interface/member implementation");
  assert.equal(value.reads(), 2, "the real implementation and default contracts are each read once, before publication");
});

test("retained method protocols require their exact producer-owned shape and checked member", () => {
  for (const mode of ["retained", "missing-shape", "foreign-subject", "non-method"]) {
    const value = fixture();
    const protocol = csharpTargetNamedType("test.MethodProtocol", undefined, { kind: "named", name: "MethodProtocol" },
      { structuralContract: true, allowsRefLikeTypeArguments: [] });
    const selected = value.shapes.structuralImplementations(value.sourceType)[0];
    const method = selected.methods[0];
    const subject = Object.freeze({});
    const member = Object.freeze({ ...method.member, sourceSubjects: Object.freeze([subject]), methodValueContract: protocol });
    value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member }] }];
    value.shapes.resolveTarget = type => type !== protocol || mode === "missing-shape" ? undefined : {
      targetType: protocol, members: [{ ...member,
        sourceSubjects: mode === "foreign-subject" ? [Object.freeze({})] : member.sourceSubjects,
        memberKind: mode === "non-method" ? "property" : "method" }],
    };
    const analyze = () => {
      const result = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes,
        value.declarations, value.projections, emptyNativeDispatch);
      assert.equal(result.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
      return result.value;
    };
    if (mode === "retained") {
      const finalized = analyze();
      assert.equal(finalized.issues.length, 0, `${mode}: the actual producer-owned protocol is admitted`);
      const implementations = finalized.objectShapes.structuralImplementations(value.sourceType);
      assert.equal(implementations.length === 2 && implementations.every(implementation => implementation.methods.length === 1), true,
        `${mode}: both exact interface obligations have one canonical native implementation`);
    } else assert.throws(analyze, error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" &&
      error.diagnostic.source === "tsonic-csharp" && error.diagnostic.sourceNode === value.declaration &&
      error.message === "An inherited method-value protocol lost its checked native member correspondence.",
    `${mode}: broken producer evidence is not a new unsupported-source restriction`);
  }
});

test("native implicit methods need no bridge while phantom destination binders still require one", () => {
  for (const phantom of [false, true]) {
    const value = fixture();
    const owner = Object.freeze({});
    value.policy.ast.parent = node => node === value.declaration ? owner : undefined;
    value.policy.ast.hasModifierKind = () => false;
    value.policy.projectTypes.catalog.definitionForDeclaration = node => node === owner
      ? { kind: "class", declaration: owner, typeParameterBindings: [] } : undefined;
    if (phantom) {
      const destinationDeclaration = Object.freeze({});
      const destinationBinder = Object.freeze({});
      const selected = value.shapes.structuralImplementations(value.sourceType)[0];
      const method = selected.methods[0];
      const canonicalGet = value.callables.get;
      value.callables.get = identity => identity.declaration === destinationDeclaration ? {
        kind: "source", sourceDeclaration: destinationDeclaration, parameters: value.implementation.parameters, nativeParameters: value.implementation.nativeParameters, returnType: integer,
        nativeSignature: { methodTypeParameterIdentities: ["destination:T"], methodAllowsRefLikeTypeArguments: [false] },
      } : canonicalGet(identity);
      value.policy.ast.parent = node => node === value.declaration ? owner : node === destinationBinder ? destinationDeclaration : undefined;
      value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member: { ...method.member,
        sourceDeclarations: [destinationDeclaration],
        typeParameters: [{ declaration: destinationBinder, identity: "destination:T", name: "T", constraints: [] }] } }] }];
    }
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length, 0, `${phantom}: exact native parameters and result are admitted`);
    const methods = finalized.objectShapes.structuralImplementations(value.sourceType)[0].methods;
    assert.equal(methods.length, phantom ? 1 : 0, `${phantom}: actual native method arity controls implicit implementation`);
    if (phantom) assert.equal(methods[0].forwarding.typeArguments.length, 0,
      "a required generic interface bridge must not pass phantom arguments to the nongeneric body");
  }
});

test("an implicit native method retains its distinct original-body protocol obligation", () => {
  const value = fixture();
  const owner = Object.freeze({});
  value.policy.ast.parent = node => node === value.declaration ? owner : undefined;
  value.policy.ast.hasModifierKind = () => false;
  value.policy.projectTypes.catalog.definitionForDeclaration = node => node === owner
    ? { kind: "class", declaration: owner, typeParameterBindings: [] } : undefined;
  const selected = value.shapes.structuralImplementations(value.sourceType)[0];
  value.shapes.structuralImplementations = () => [{ ...selected, methods: selected.methods.map(method => ({ ...method,
    member: { ...method.member, methodValueContract: selected.interfaceType } })) }];
  const result = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes,
    value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(result.kind === "resolved" && result.value.issues.length === 0, true, "the exact original native method is admitted");
  const methods = result.value.objectShapes.structuralImplementations(value.sourceType)[0].methods;
  assert.equal(methods.length === 1 && methods[0].requiresMethodForwarding === false, true,
    "the existing public method satisfies only its ordinary native entry");
  assert.equal(methods[0].forwarding.implementation === value.implementation, true, "the body keeps its original physical contract");
  const emitted = structuralInterfaceRecords(result.value.objectShapes, value.sourceType).structuralInterface.get(value.sourceType);
  assert.deepEqual(emitted[0].methods[0].invocations.map(invocation => [invocation.name, invocation.sourceName]),
    [["__tsonic_invoke_body_read", "read"]], "only the distinct body entry is forwarded, without a redundant ordinary bridge");
});

test("canonical generic admission alpha-aligns real body parameters and retains actual source metadata", () => {
  const value = fixture();
  const source = Object.freeze({ kind: "type-parameter", identity: "body:U", name: "U" });
  const destination = Object.freeze({ kind: "type-parameter", identity: "view:T", name: "T" });
  const implementation = sourceContract({ ...value.implementation, nativeSignature: { methodTypeParameterIdentities: Object.freeze([source.identity]),
    methodAllowsRefLikeTypeArguments: Object.freeze([false]) }, returnType: source,
    nativeParameters: Object.freeze([Object.freeze({ sourceParameter: value.sourceParameter,
      targetParameter: Object.freeze({ name: "value", type: source, passingMode: "by-value" }) })]) });
  const destinationDeclaration = Object.freeze({});
  const destinationBinder = Object.freeze({});
  const bodyBinder = Object.freeze({});
  const destinationContract = sourceContract({ sourceDeclaration: destinationDeclaration, nativeSignature: { methodTypeParameterIdentities: [destination.identity],
    methodAllowsRefLikeTypeArguments: [false] }, returnType: destination,
    nativeParameters: [{ sourceParameter: Object.freeze({}), targetParameter: { name: "value", type: destination, passingMode: "by-value" } }] });
  value.callables.get = identity => identity.declaration === value.declaration ? implementation
    : identity.declaration === destinationDeclaration ? destinationContract : undefined;
  value.policy.ast.parent = node => node === destinationBinder ? destinationDeclaration : undefined;
  const selected = value.shapes.structuralImplementations(value.sourceType)[0];
  const method = selected.methods[0];
  value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member: { ...method.member,
    sourceDeclarations: [destinationDeclaration],
    type: csharpDelegateTargetType("System.Func", [destination], destination),
    typeParameters: [{ declaration: destinationBinder, identity: destination.identity, name: destination.name, constraints: [] }] } }] }];
  value.shapes.resolveTarget = () => ({ targetType: value.sourceType, members: [{ ...method.member,
    sourceSubjects: [value.declaration], typeParameters: [{ declaration: bodyBinder, identity: source.identity, name: source.name, constraints: [] }] }] });
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 0, "different authored generic names have one native signature");
  const forwarding = finalized.objectShapes.structuralImplementations(value.sourceType)[0].methods[0].forwarding;
  assert.equal(forwarding.typeArguments.length === 1 && forwarding.typeArguments[0].identity === destination.identity, true,
    "the actual generic body invocation receives the selected destination binder");
  assert.equal(forwarding.parameters[0].adapter.conversion.kind === "identity" && forwarding.result.conversion.kind === "identity", true,
    "alpha-equivalent values do not acquire conversions or boxes");
  assert.equal(forwarding.implementation.nativeSignature.methodTypeParameterIdentities === implementation.nativeSignature.methodTypeParameterIdentities &&
    forwarding.implementation.nativeSignature.methodAllowsRefLikeTypeArguments === implementation.nativeSignature.methodAllowsRefLikeTypeArguments, true,
  "the body's mandatory metadata is preserved rather than copied from the interface");
});

const nativeBoundBase = csharpTargetNamedType("test.BoundBase", undefined, { kind: "named", name: "BoundBase" },
  { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [] });
const nativeBoundDerived = csharpTargetNamedType("test.BoundDerived", undefined, { kind: "named", name: "BoundDerived" },
  { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [] });

function genericBoundFixture(bodyConstraints, destinationConstraints, bodyPermissions = [false], destinationPermissions = [false]) {
  const value = fixture();
  const owner = Object.freeze({});
  const bodyBinder = Object.freeze({});
  const destinationBinder = Object.freeze({});
  const destinationDeclaration = Object.freeze({});
  const body = sourceContract({ ...value.implementation, nativeParameters: Object.freeze([]),
    nativeSignature: { methodTypeParameterIdentities: Object.freeze(["body:U"]), methodAllowsRefLikeTypeArguments: Object.freeze(bodyPermissions) } });
  const destination = sourceContract({ sourceDeclaration: destinationDeclaration, nativeParameters: Object.freeze([]), returnType: integer,
    nativeSignature: { methodTypeParameterIdentities: Object.freeze(["view:T"]), methodAllowsRefLikeTypeArguments: Object.freeze(destinationPermissions) } });
  const selected = value.shapes.structuralImplementations(value.sourceType)[0];
  const original = selected.methods[0];
  const signature = csharpDelegateTargetType("System.Func", [], integer);
  const bodyMember = Object.freeze({ ...original.member, type: signature, sourceSubjects: [value.declaration],
    sourceDeclarations: [value.declaration], typeParameters: [{ declaration: bodyBinder, identity: "body:U", name: "U", constraints: bodyConstraints }] });
  const destinationMember = Object.freeze({ ...original.member, type: signature, sourceDeclarations: [destinationDeclaration],
    typeParameters: [{ declaration: destinationBinder, identity: "view:T", name: "T", constraints: destinationConstraints }] });
  value.callables.get = identity => identity.declaration === value.declaration ? body
    : identity.declaration === destinationDeclaration ? destination : undefined;
  value.policy.ast.parent = node => node === value.declaration ? owner : node === bodyBinder ? value.declaration
    : node === destinationBinder ? destinationDeclaration : undefined;
  value.policy.ast.hasModifierKind = () => false;
  value.policy.ast.is = { IsObjectLiteralExpression: () => false };
  const definition = Object.freeze({ kind: "class", declaration: owner, typeParameterBindings: [] });
  value.policy.projectTypes.catalog.definitionForDeclaration = node => node === owner ? definition : undefined;
  value.policy.projectTypes.catalog.definitionForTarget = type => type.id === nativeBoundBase.id || type.id === nativeBoundDerived.id
    ? { kind: "class" } : undefined;
  value.policy.projectTypes.directSupertypes = type => type.id === nativeBoundDerived.id ? [nativeBoundBase] : [];
  value.shapes.resolveTarget = type => type.id === value.sourceType.id ? { targetType: value.sourceType, members: [bodyMember] } : undefined;
  value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...original, member: destinationMember }] }];
  return value;
}

for (const control of [
  { name: "equal native bounds", body: [{ kind: "type", type: nativeBoundBase }], destination: [{ kind: "type", type: nativeBoundBase }], accepted: true, bridges: 0 },
  { name: "weaker implementation bound", body: [{ kind: "type", type: nativeBoundBase }], destination: [{ kind: "type", type: nativeBoundDerived }], accepted: true, bridges: 1 },
  { name: "stricter phantom implementation bound", body: [{ kind: "type", type: nativeBoundDerived }], destination: [{ kind: "type", type: nativeBoundBase }], accepted: false },
  { name: "nominal class implies reference constraint", body: [{ kind: "keyword", keyword: "class" }], destination: [{ kind: "type", type: nativeBoundBase }], accepted: true, bridges: 1 },
  { name: "reference constraint does not select a native subclass", body: [{ kind: "type", type: nativeBoundBase }], destination: [{ kind: "keyword", keyword: "class" }], accepted: false },
  { name: "class does not imply a constructor", body: [{ kind: "constructor" }], destination: [{ kind: "keyword", keyword: "class" }], accepted: false },
  { name: "value constraint implies native construction", body: [{ kind: "constructor" }], destination: [{ kind: "keyword", keyword: "struct" }], accepted: true, bridges: 1 },
  { name: "unmanaged implies value constraint", body: [{ kind: "keyword", keyword: "struct" }], destination: [{ kind: "keyword", keyword: "unmanaged" }], accepted: true, bridges: 1 },
  { name: "value constraint does not imply unmanaged", body: [{ kind: "keyword", keyword: "unmanaged" }], destination: [{ kind: "keyword", keyword: "struct" }], accepted: false },
  { name: "reference constraint implies native non-null", body: [{ kind: "keyword", keyword: "notnull" }], destination: [{ kind: "keyword", keyword: "class" }], accepted: true, bridges: 1 },
]) {
  test(`canonical generic native admission: ${control.name}`, () => {
    const value = genericBoundFixture(control.body, control.destination);
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length, control.accepted ? 0 : 1, `${control.name}: exact native invocation legality`);
    const methods = finalized.objectShapes.structuralImplementations(value.sourceType)[0].methods;
    assert.equal(methods.length, control.accepted ? control.bridges : 0,
      `${control.name}: invocation implication does not replace native implicit constraint equivalence`);
    for (const method of methods) {
      assert.equal(method.forwarding.explicitConstraints.length, method.forwarding.typeParameters.length,
        `${control.name}: every implemented binder has its required sealed primary disposition`);
      assert.equal(Object.isFrozen(method.forwarding.explicitConstraints), true,
        `${control.name}: the renderer cannot recompute native constraints`);
    }
    if (!control.accepted) assert.equal(finalized.issues[0]?.node === value.declaration &&
      finalized.issues[0]?.code === "CSHARP_PROJECT_CALLABLE_ADAPTER_NOT_PROVEN" &&
      finalized.issues[0]?.message === "An interface method's native type arguments do not satisfy its implementation's generic constraints.", true,
    `${control.name}: a reachable native constraint failure is an exact expected owner issue`);
  });
}

for (const control of [
  { name: "identical declared permissions", body: [false], destination: [false], accepted: true, bridges: 0 },
  { name: "a body permitting ref structs accepts an ordinary destination", body: [true], destination: [false], accepted: true, bridges: 1 },
  { name: "a ref-struct destination cannot call an ordinary body", body: [false], destination: [true], accepted: false },
  { name: "missing body permission is not false", body: [], destination: [false], accepted: false },
  { name: "missing destination permission is not false", body: [false], destination: [], accepted: false },
]) {
  test(`canonical generic native metadata: ${control.name}`, () => {
    const value = genericBoundFixture([], [], control.body, control.destination);
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length, control.accepted ? 0 : 1, `${control.name}: actual anti-constraint evidence governs`);
    assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0].methods.length,
      control.accepted ? control.bridges : 0, `${control.name}: no generic bridge is published with unproved permissions`);
    if (!control.accepted) assert.equal(finalized.issues[0]?.node === value.declaration &&
      finalized.issues[0]?.code === "CSHARP_PROJECT_CALLABLE_ADAPTER_NOT_PROVEN", true,
    `${control.name}: native metadata failures reject before publication rather than defaulting or throwing an invariant`);
  });
}

test("matching native projection layouts retain all actual binder, permission and invocation slots", () => {
  const value = genericBoundFixture([], []);
  const selected = value.shapes.structuralImplementations(value.sourceType)[0];
  const method = selected.methods[0];
  const destinationDeclaration = method.member.sourceDeclarations[0];
  const body = value.callables.get({ declaration: value.declaration });
  const destination = value.callables.get({ declaration: destinationDeclaration });
  const bodyParameter = Object.freeze({ kind: "type-parameter", identity: "body:U", name: "U" });
  const destinationParameter = Object.freeze({ kind: "type-parameter", identity: "view:T", name: "T" });
  const projected = parameter => ["operations", "storage"].map(part => csharpProjectedType({
    kind: "optional", part, arguments: [parameter],
  })).sort((left, right) => left.name.localeCompare(right.name));
  const bodyProjections = projected(bodyParameter);
  const destinationProjections = projected(destinationParameter);
  const bodyStorage = bodyProjections.find(parameter => parameter.csharpProjection.part === "storage");
  const destinationStorage = destinationProjections.find(parameter => parameter.csharpProjection.part === "storage");
  const widened = Object.freeze({ kind: "source-primitive", name: "float64" });
  const bodyParameters = [{ sourceParameter: value.sourceParameter, targetParameter: {
    name: "value", type: bodyStorage, passingMode: "by-value" } }];
  const destinationParameters = [{ sourceParameter: Object.freeze({}), targetParameter: {
    name: "value", type: destinationStorage, passingMode: "by-value" } }];
  const bodyContract = sourceContract({ ...body, nativeParameters: bodyParameters,
    nativeSignature: { methodTypeParameterIdentities: [bodyParameter.identity, ...bodyProjections.map(parameter => parameter.identity)],
    methodAllowsRefLikeTypeArguments: [false, false, false] } });
  const destinationContract = sourceContract({ ...destination, nativeParameters: destinationParameters, returnType: widened,
    nativeSignature: { methodTypeParameterIdentities: [destinationParameter.identity, ...destinationProjections.map(parameter => parameter.identity)],
    methodAllowsRefLikeTypeArguments: [false, false, false] } });
  value.callables.get = identity => identity.declaration === value.declaration ? bodyContract
    : identity.declaration === destinationDeclaration ? destinationContract : undefined;
  const bodyShape = value.shapes.resolveTarget(value.sourceType);
  value.shapes.resolveTarget = () => ({ ...bodyShape, members: [{ ...bodyShape.members[0],
    typeParameters: [...bodyShape.members[0].typeParameters, ...bodyProjections.map(parameter => ({
      declaration: value.declaration, identity: parameter.identity, name: parameter.name,
      constraints: parameter.csharpProjectionConstraints,
    }))],
    type: csharpDelegateTargetType("System.Func", [bodyStorage], integer) }] });
  value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member: { ...method.member,
    typeParameters: [...method.member.typeParameters, ...destinationProjections.map(parameter => ({
      declaration: destinationDeclaration, identity: parameter.identity, name: parameter.name,
      constraints: parameter.csharpProjectionConstraints,
    }))],
    type: csharpDelegateTargetType("System.Func", [destinationStorage], widened) } }] }];
  value.projections.get = declaration => declaration === value.declaration ? bodyProjections
    : declaration === destinationDeclaration ? destinationProjections : Object.freeze([]);
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 0, "the real matching projection tail is not confused with authored binder arity");
  const forwarding = finalized.objectShapes.structuralImplementations(value.sourceType)[0].methods[0].forwarding;
  assert.equal(forwarding.typeParameters.length === 3 && forwarding.typeArguments.length === 3, true,
    "both native operations and storage slots survive alongside the real authored binder");
  assert.equal(forwarding.typeArguments.every((argument, index) => argument.identity === destinationContract.nativeSignature.methodTypeParameterIdentities[index]), true,
    "the body invocation uses the exact existing destination witnesses, not fabricated native parameters");
  assert.equal(forwarding.implementation.nativeSignature.methodAllowsRefLikeTypeArguments === bodyContract.nativeSignature.methodAllowsRefLikeTypeArguments, true,
    "native permission evidence retains the original full callable vector");
  assert.equal(forwarding.parameters[0].adapter.conversion.kind, "identity", "matching native storage is forwarded without conversion or copying");
});

for (const missing of ["canonical method contract", "native parameter passing correspondence"]) {
  test(`structural forwarding refuses incomplete ${missing} before a backend method can be published`, () => {
    const value = fixture();
    if (missing === "canonical method contract") value.callables.get = () => undefined;
    else {
      const selected = value.shapes.structuralImplementations(value.sourceType)[0];
      const method = selected.methods[0];
      const member = { ...method.member, type: { ...method.member.type,
        csharpDelegateSignature: { ...method.member.type.csharpDelegateSignature, parameterPassingModes: [] },
      } };
      value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member }] }];
    }
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length, 1, "one precise incomplete native contract diagnostic");
    assert.equal(finalized.issues[0]?.node === value.declaration, true, "the exact implementation declaration owns the failure");
    assert.equal(finalized.issues[0]?.message, "An analyzed interface method has no exact native forwarding signature.",
      "the existing refusal is not replaced by a fallback or guessed parameter mode");
    assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0]?.methods.length, 0,
      "no partial native method is supplied to the backend");
  });
}

for (const passingMode of ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]) {
  test(`structural forwarding preserves the canonical ${passingMode} incoming parameter without a body prelude`, () => {
    const value = fixture(passingMode);
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length, 0, "identical native passing contracts need no new adaptation capability");
    const diagnostics = [];
    const planned = planCsharpStructuralInterfaceMembers({ targetType: value.sourceType }, {
      program: { records: structuralInterfaceRecords(finalized.objectShapes, value.sourceType), source: { ast: {
        getSourceFile: () => ({}), parameters: () => assert.fail("the renderer cannot plan method parameters or defaults again"),
      } } }, scope: {},
    }, diagnostics);
    assert.equal(diagnostics.length, 0, "stored native forwarding needs no source rejection");
    assert.equal(planned.length, 1, "one selected explicit interface method");
    const method = planned[0];
    const expected = passingMode === "by-value" ? undefined : passingMode === "byref-readonly" ? "in"
      : passingMode === "byref-readwrite" ? "ref" : "out";
    assert.equal(method.parameters.length, 1, "all physical incoming parameters retained");
    assert.equal(method.parameters[0]?.passing, expected, "native declaration passing mode");
    assert.equal(method.body.statements.length, 1, "the implementation alone owns the default/destructuring body");
    const call = method.body.statements[0].expression;
    assert.equal(call.kind, "InvocationExpression", "one direct native call");
    assert.equal(call.arguments[0]?.passing, expected, "native invocation passing mode");
    assert.equal(call.arguments[0]?.expression.kind, "IdentifierName", "no duplicated default initializer or destructuring");
  });
}

const programs = [
  ["effectful default", `interface View { read(value?: int32): int32; }
let calls: int32 = 0;
function next(): int32 { calls += 1; return 700123; }
class Box { read(value: int32 = next()): int32 { return value; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["destructured default", `interface View { read(value?: { left: int32 }): int32; }
class Box { read({ left }: { left: int32 } = { left: 700123 }): int32 { return left; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["unused incoming parameter", `interface View { read(value?: int32, ignored?: int32): int32; }
class Box { read(value: int32 = 700123, ignored: int32 = 4): int32 { return value; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["rest incoming parameter", `interface View { read(...values: int32[]): int32; }
class Box { read(...values: int32[]): int32 { return values[0]; } }
export function run(): int32 { const value: View = new Box(); return value.read(700123); }`, 1],
];

for (const surface of ["native", "js"]) {
  for (const [name, source, literalCount] of programs) {
    test(`structural ${name} uses the completed native method ABI (${surface})`, () => {
      const compiled = compileCsharpSource({ surface,
        sourceText: 'import type { int32 } from "@tsonic/core/types.js";\n' + source });
      assert.equal(compiled.result.diagnostics.length, 0,
        `native forwarding: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal((generated.match(/\b700123\b/gu) ?? []).length, literalCount,
        "the authored initializer/value is emitted once, not copied into a forwarding body");
      if (name === "unused incoming parameter") {
        const { program } = compiled.result;
        const ast = program.source.ast;
        let declaration;
        const visit = node => {
          if (ast.is.IsMethodDeclaration(node) && ast.text(ast.name(node)) === "read") declaration = node;
          ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
        };
        csharpProgramSourceFiles(program).forEach(visit);
        assert.equal(declaration !== undefined, true, "the exact authored method remains in the sealed source domain");
        const method = program.records.callableDispatch.get(declaration)?.implementation;
        assert.equal(method?.nativeParameters.length, 2, "unused and omittable native parameters are not dropped");
        assert.equal(method?.nativeParameters.every(parameter => parameter.targetParameter.optional === true), true,
          "both native omission contracts are retained");
        assert.equal(/public int read\(int\? [^,\n]+, int\? /u.test(generated), true,
          "the actual native method, whether directly satisfying the interface or forwarded, retains both incoming slots");
      }
    });
  }
}

const nativeModes = [
  { name: "Ref", modes: ["byref-readwrite"], signature: "ref int value", arguments: "ref value",
    implementation: "value += 3; return value;" },
  { name: "In", modes: ["byref-readonly"], signature: "in int value", arguments: "in value",
    implementation: "return value + 9;" },
  { name: "Out", modes: ["byref-writeonly-must-init"], signature: "out int value", arguments: "out value",
    implementation: "value = 23; return value;" },
  { name: "Mixed", modes: ["by-value", "byref-readwrite", "byref-readonly", "byref-writeonly-must-init"],
    signature: "int first, ref int second, in int third, out int fourth", arguments: "first, ref second, in third, out fourth",
    implementation: "second += first; fourth = second + third; return fourth;" },
];

function adaptedNativeForwarder(control, destinationNames = []) {
  const declaration = Object.freeze({});
  const destinationDeclaration = Object.freeze({});
  const sourceType = csharpTargetNamedType(`Proof.Generated${control.name}`, undefined, undefined,
    { allowsRefLikeTypeArguments: [] });
  const interfaceType = csharpTargetNamedType(`Proof.I${control.name}`, undefined,
    { kind: "named", namespace: ["Proof"], name: `I${control.name}` },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [] });
  const widened = Object.freeze({ kind: "source-primitive", name: "int64" });
  const signature = csharpTargetNamedType(`Proof.${control.name}Signature`, undefined,
    { kind: "named", namespace: ["Proof"], name: `${control.name}Signature` },
    { allowsRefLikeTypeArguments: [], delegateSignature: { parameters: Object.freeze(control.modes.map(() => integer)),
      parameterPassingModes: Object.freeze([...control.modes]), returnType: widened } });
  const implementation = sourceContract({ sourceDeclaration: declaration, nativeSignature: { methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]) },
    nativeParameters: Object.freeze(control.modes.map((passingMode, index) => Object.freeze({ sourceParameter: Object.freeze({}),
      targetParameter: Object.freeze({ name: `value${index}`, type: integer, passingMode }) }))), returnType: integer });
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type: signature,
    sourceDeclarations: Object.freeze([destinationDeclaration]),
    ...(destinationNames.length === 0 ? {} : { typeParameters: Object.freeze(destinationNames.map((name, index) => Object.freeze({
      declaration: Object.freeze({}), identity: `destination:${control.name}:${index}`, name, csharpAllowsRefLike: false, constraints: Object.freeze([]),
    }))) }),
  });
  const selected = Object.freeze({ sourceNode: declaration, sourceType, interfaceType, properties: Object.freeze([]), methods: Object.freeze([
    Object.freeze({ sourceName: "read", declaration, member }),
  ]) });
  const destinationBinders = new Set(member.typeParameters?.map(parameter => parameter.declaration) ?? []);
  const destinationContract = sourceContract({ sourceDeclaration: destinationDeclaration,
    nativeSignature: { methodTypeParameterIdentities: Object.freeze(member.typeParameters?.map(parameter => parameter.identity) ?? []),
    methodAllowsRefLikeTypeArguments: Object.freeze(destinationNames.map(() => false)) },
    nativeParameters: implementation.nativeParameters, returnType: widened });
  const policy = { ast: { parent: node => destinationBinders.has(node) ? destinationDeclaration : undefined,
    parameters: () => assert.fail("native forwarding cannot re-plan source parameters") },
    projectTypes: { catalog: { definitions: Object.freeze([]), definitionForDeclaration: () => undefined, definitionForTarget: () => undefined }, directSupertypes: () => [] },
    objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }),
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
  const finalizedResult = analyzeCsharpProjectCallableAdapters(policy,
    { declarationContracts: Object.freeze([]), get: identity => identity.declaration === declaration ? implementation
      : identity.declaration === destinationDeclaration ? destinationContract : undefined },
    { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]), structuralImplementations: () => Object.freeze([selected]),
      resolveTarget: () => undefined },
    { runtimeDefault: { get: () => undefined } }, { get: () => Object.freeze([]) }, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural forwarding preserves its native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 0, `${control.name}: canonical native admission accepts exact byref parameters and an adapted result`);
  const forwarding = finalized.objectShapes.structuralImplementations(sourceType)[0]?.methods[0]?.forwarding;
  assert.equal(forwarding?.implementation === implementation, true, `${control.name}: exact canonical physical method identity`);
  assert.equal(forwarding?.result.conversion.kind, "implicit", `${control.name}: the result is genuinely adapted, not identity`);
  assert.equal(forwarding?.result.conversion.proof, "numeric", `${control.name}: native int32-to-int64 widening`);
  assert.equal(forwarding?.parameters.every(adapter => adapter.kind === "value" && adapter.adapter.conversion.kind === "identity"), true,
    `${control.name}: byref values never convert, copy or acquire a temporary`);
  const diagnostics = [];
  const planned = planCsharpStructuralInterfaceMembers({ targetType: sourceType }, {
    program: { records: structuralInterfaceRecords(finalized.objectShapes, sourceType), source: { ast: { getSourceFile: () => ({}),
      parameters: () => assert.fail("native rendering cannot re-read parameter/default syntax") } } },
    names: { temporaryName: () => assert.fail("identity byref forwarding cannot allocate a native temporary") }, scope: {},
  }, diagnostics);
  assert.equal(diagnostics.length, 0, `${control.name}: selected native arguments and result render without rejection`);
  assert.equal(planned.length, 1, `${control.name}: one explicit interface adapter`);
  const method = planned[0];
  assert.equal(Object.hasOwn(forwarding.contract, "methodTypeParameterIdentities"), false,
    `${control.name}: the physical view has no invented generic call identities`);
  assert.equal(Object.hasOwn(forwarding.contract, "methodAllowsRefLikeTypeArguments"), false,
    `${control.name}: the physical view has no invented permission vector`);
  assert.equal(implementation.nativeSignature.methodTypeParameterIdentities.length, 0, `${control.name}: the actual implementation is nongeneric`);
  assert.equal(implementation.nativeSignature.methodAllowsRefLikeTypeArguments.length, 0, `${control.name}: exact zero-arity implementation metadata remains required`);
  assert.equal((method.typeParameters?.length ?? 0), destinationNames.length, `${control.name}: exact selected destination binder count`);
  for (const [index, name] of destinationNames.entries()) assert.equal(method.typeParameters[index].name, name === "event" ? "@event" : name,
    `${control.name}: destination binder ${index}, not implementation identities`);
  assert.equal(method.parameters.length, control.modes.length, `${control.name}: every native declaration slot is retained`);
  assert.equal(method.returnType.name, "long", `${control.name}: the explicit interface retains its adapted native return width`);
  assert.equal(method.body.statements.length, 1, `${control.name}: one direct call, no local copies or default/body duplication`);
  const call = method.body.statements[0].expression;
  assert.equal(Object.hasOwn(call.callee, "typeArguments"), false, `${control.name}: no phantom generic arguments on the nongeneric body`);
  assert.equal(call.kind, "InvocationExpression", `${control.name}: result widening does not wrap or replace the invocation`);
  assert.equal(call.arguments.length, control.modes.length, `${control.name}: every native invocation argument is retained`);
  for (const [index, mode] of control.modes.entries()) {
    const passing = mode === "by-value" ? undefined : mode === "byref-readonly" ? "in"
      : mode === "byref-readwrite" ? "ref" : "out";
    assert.equal(method.parameters[index].passing, passing, `${control.name}: declaration passing ${index}`);
    assert.equal(call.arguments[index].passing, passing, `${control.name}: invocation passing ${index}`);
    assert.equal(call.arguments[index].expression.kind, "IdentifierName", `${control.name}: argument ${index} retains its native location`);
    assert.equal(call.arguments[index].expression.name, method.parameters[index].name, `${control.name}: argument ${index} identity`);
  }
  return method;
}

for (const control of nativeModes) {
  test(`structural ${control.name} forwarding preserves every passing slot with an adapted native result`, () => {
    adaptedNativeForwarder(control);
  });
}

function nativeProofSource(omitModes = [], destinationNames = []) {
  const binders = destinationNames.length === 0 ? "" : `<${destinationNames.map(name => name === "event" ? "@event" : name).join(", ")}>`;
  const arguments_ = destinationNames.length === 0 ? "" : `<${destinationNames.map(() => "object").join(", ")}>`;
  const generated = printCsharpCompilationUnit({ kind: "CompilationUnit", usings: [], members: [
    { kind: "NamespaceDeclaration", name: "Proof", members: nativeModes.map(control => {
      const original = adaptedNativeForwarder(control, destinationNames);
      const call = original.body.statements[0].expression;
      const method = !omitModes.includes(control.name) ? original : { ...original, body: { kind: "Block", statements: [
        { ...original.body.statements[0], expression: { ...call,
          arguments: call.arguments.map(({ passing: _passing, ...argument }) => argument) } },
      ] } };
      return { kind: "ClassDeclaration", name: `Generated${control.name}`, modifiers: ["public", "sealed"],
        baseType: { kind: "IdentifierName", name: `Body${control.name}` },
        interfaces: [{ kind: "IdentifierName", name: `I${control.name}` }], members: [method] };
    }) },
  ] });
  const native = nativeModes.map(control => `
public delegate long ${control.name}Signature(${control.signature});
public interface I${control.name} { long read${binders}(${control.signature}); }
public class Body${control.name} {
    public int Calls { get; private set; }
    public int read(${control.signature}) { Calls++; ${control.implementation} }
    ${control.name === "In" ? "public int read(int value) { Calls++; return -9001; }" : ""}
}
public sealed class Native${control.name} : Body${control.name}, I${control.name} {
    long I${control.name}.read${binders}(${control.signature}) { return this.read(${control.arguments}); }
}`).join("\n");
  return `${generated}\nnamespace Proof { ${native}
public static class Entry {
    public static void Main() {
        var generatedRef = new GeneratedRef(); var nativeRef = new NativeRef();
        int generatedValue = 5, nativeValue = 5;
        long generatedResult = ((IRef)generatedRef).read${arguments_}(ref generatedValue);
        long nativeResult = ((IRef)nativeRef).read${arguments_}(ref nativeValue);
        if (generatedResult != 8L || nativeResult != generatedResult || generatedValue != 8 || nativeValue != generatedValue || generatedRef.Calls != 1 || nativeRef.Calls != 1)
            throw new System.Exception("ref adapted native forwarding");
        var generatedIn = new GeneratedIn(); var nativeIn = new NativeIn();
        generatedValue = 5; nativeValue = 5;
        generatedResult = ((IIn)generatedIn).read${arguments_}(in generatedValue);
        nativeResult = ((IIn)nativeIn).read${arguments_}(in nativeValue);
        if (generatedResult != 14L || nativeResult != generatedResult || generatedValue != 5 || nativeValue != generatedValue || generatedIn.Calls != 1 || nativeIn.Calls != 1)
            throw new System.Exception("in adapted native forwarding");
        var generatedOut = new GeneratedOut(); var nativeOut = new NativeOut();
        generatedResult = ((IOut)generatedOut).read${arguments_}(out generatedValue);
        nativeResult = ((IOut)nativeOut).read${arguments_}(out nativeValue);
        if (generatedResult != 23L || nativeResult != generatedResult || generatedValue != 23 || nativeValue != generatedValue || generatedOut.Calls != 1 || nativeOut.Calls != 1)
            throw new System.Exception("out adapted native forwarding");
        var generatedMixed = new GeneratedMixed(); var nativeMixed = new NativeMixed();
        generatedValue = 5; nativeValue = 5; int generatedReadonly = 11, nativeReadonly = 11;
        generatedResult = ((IMixed)generatedMixed).read${arguments_}(2, ref generatedValue, in generatedReadonly, out int generatedOutput);
        nativeResult = ((IMixed)nativeMixed).read${arguments_}(2, ref nativeValue, in nativeReadonly, out int nativeOutput);
        if (generatedResult != 18L || nativeResult != generatedResult || generatedValue != 7 || nativeValue != generatedValue || generatedReadonly != 11 || nativeReadonly != generatedReadonly || generatedOutput != 18 || nativeOutput != generatedOutput || generatedMixed.Calls != 1 || nativeMixed.Calls != 1)
            throw new System.Exception("mixed adapted native forwarding");
        System.Console.Write("ref,in,out,mixed: native-equivalent");
    }
} }\n`;
}

function buildNativeProof(name, omitModes = []) {
  return buildNativeProject(name, nativeProofSource(omitModes));
}

function buildNativeProject(name, sourceText, artifacts = new Map()) {
  const scratch = fileURLToPath(new URL("../../../.temp/structural-forwarding-native/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, `${name}-`));
  writeFileSync(join(root, "Program.cs"), sourceText);
  for (const [path, text] of artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const references = artifacts.size === 0 ? "" : `<ItemGroup>${[
    "csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj",
    "csharp-js/src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj",
  ].map(path => `<ProjectReference Include="${fileURLToPath(new URL(`../../../../${path}`, import.meta.url))}" />`).join("")}</ItemGroup>`;
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><LangVersion>14.0</LangVersion>
<Nullable>enable</Nullable><ImplicitUsings>disable</ImplicitUsings><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
<TsonicRuntimeArtifactsPath>${join(root, "runtime-artifacts")}/</TsonicRuntimeArtifactsPath>
</PropertyGroup>${references}</Project>\n`);
  const child = { cwd: root, encoding: "utf8", timeout: 240_000, maxBuffer: 1_048_576,
    env: { ...process.env, DOTNET_PROCESSOR_COUNT: String(process.env.TSONIC_TEST_CHILD_JOBS ?? "1"),
      DOTNET_CLI_USE_MSBUILD_SERVER: "0", MSBUILDDISABLENODEREUSE: "1" } };
  const build = spawnSync("dotnet", ["build", join(root, "Proof.csproj"), "-c", "Release", "--nologo", "--verbosity", "quiet",
    "-m:1", "-nr:false", "-p:UseSharedCompilation=false", "-p:BuildInParallel=false"], child);
  writeFileSync(join(root, "build.log"), `${build.stdout ?? ""}\n${build.stderr ?? ""}`);
  process.stdout.write(`C19 native proof ${name}: ${root}\n`);
  return { root, build, run: () => {
    const result = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--no-build", "--no-restore"], child);
    writeFileSync(join(root, "run.log"), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    return result;
  } };
}

test("real .NET structural ref, in, out and mixed forwarding match handwritten adapted-return implementations", () => {
  const proof = buildNativeProof("adapted-return");
  assert.equal(proof.build.status, 0, `native build: ${String(proof.build.stdout).slice(-4096)} ${proof.build.error ?? ""}`);
  const executed = proof.run();
  assert.equal(executed.status, 0, `native execution: ${String(executed.stderr).slice(-4096)} ${executed.error ?? ""}`);
  assert.equal(executed.stdout, "ref,in,out,mixed: native-equivalent", "exact by-reference effects, call counts and widened native results");
});

test("native structural countercontrol rejects missing ref and out invocation modifiers", () => {
  const proof = buildNativeProof("missing-ref-out", ["Ref", "Out"]);
  assert.equal(proof.build.status === 0, false, "native compilation rejects both missing required argument modifiers");
  const diagnostics = `${proof.build.stdout}\n${proof.build.stderr}`;
  assert.equal(diagnostics.includes("error CS1620") && diagnostics.includes("'ref'") && diagnostics.includes("'out'"), true,
    "Roslyn proves the ref/out native argument contract is actually required");
});

test("native structural countercontrol observes omitted in selecting a different valid overload", () => {
  const proof = buildNativeProof("missing-in", ["In"]);
  assert.equal(proof.build.status, 0, "C# legally permits an omitted in modifier and selects the by-value overload");
  const executed = proof.run();
  assert.equal(executed.status === 0, false, "the observer detects incorrect native overload selection");
  assert.equal(String(executed.stderr).includes("in adapted native forwarding"), true,
    "the failure is the native in-overload observation, not an unrelated compile or process failure");
});

test("zero-binder native output remains byte-identical to the accepted C62 proof", () => {
  assert.equal(createHash("sha256").update(nativeProofSource()).digest("hex"),
    "34063a4fa39ade1eb3316f049074a6aad3b91df7962316e93a9cf9d373ebe1c3",
    "the physical Pick and fixture metadata add no clause, call, wrapper or changed native source");
});

test("selected destination binders preserve every native passing mode without changing the nongeneric implementation", () => {
  for (const control of nativeModes) adaptedNativeForwarder(control, ["event", "U"]);
});

test("real .NET generic destination adapters retain ref, in, out, mixed modes and adapted native results", () => {
  const proof = buildNativeProject("generic-adapted-return", nativeProofSource([], ["event", "U"]));
  assert.equal(proof.build.status, 0, `generic native build: ${String(proof.build.stdout).slice(-4096)}`);
  const executed = proof.run();
  assert.equal(executed.status, 0, `generic native effects: ${String(executed.stderr).slice(-4096)}`);
  assert.equal(executed.stdout, "ref,in,out,mixed: native-equivalent", "all exact locations, values, widths and single calls match native");
});

const genericCases = [
  { name: "named", declaration: "interface NamedView { read<T>(value?: int32): int32; }", view: "NamedView", args: "string", owner: "Body" },
  { name: "anonymous", declaration: "type AnonymousView = { read<T>(value?: int32): int32 };", view: "AnonymousView", args: "string", owner: "Body" },
  { name: "constrained", declaration: "interface ConstrainedView { read<T extends object>(value?: int32): int32; }",
    view: "ConstrainedView", args: "Body", owner: "Body" },
  { name: "dependent", declaration: "interface DependentView { read<T extends object, U extends T>(value?: int32): int32; }",
    view: "DependentView", args: "Body, Body", owner: "Body" },
  { name: "outer", declaration: "interface OuterView<Outer extends object> { read<T extends Outer>(value?: int32): int32; }",
    view: "OuterView<Body>", args: "Body", owner: "OuterBody<Body>" },
  { name: "inherited", declaration: `interface InheritedRoot<Outer extends object> { read<T extends Outer>(value?: int32): int32; }
interface InheritedLeft<Outer extends object> extends InheritedRoot<Outer> {}
interface InheritedRight<Outer extends object> extends InheritedRoot<Outer> {}
interface InheritedView<Outer extends object> extends InheritedLeft<Outer>, InheritedRight<Outer> {}`,
    view: "InheritedView<Body>", args: "Body", owner: "Body" },
  { name: "keyword", declaration: "interface KeywordView { read<event>(value?: int32): int32; }", view: "KeywordView", args: "string", owner: "Body" },
  { name: "shadow", declaration: "interface ShadowView { read<T>(value?: int32): int32; }", view: "ShadowView", args: "string", owner: "ShadowBody<Body>" },
];

function genericSource(controls) {
  return `import type { int32 } from "@tsonic/core/types.js";
class Body { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
class OuterBody<Outer extends object> { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
class ShadowBody<T> { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
${controls.map(control => `${control.declaration}
export function ${control.name}(present: boolean): int32 {
  const body = new ${control.owner}();
  const view: ${control.view} = body;
  const value = present ? view.read<${control.args}>(11) : view.read<${control.args}>();
  if (body.calls !== 1) return -100;
  return value;
}`).join("\n")}`;
}

for (const surface of ["native", "js"]) {
  for (const control of genericCases) {
    test(`full ${control.name} generic destination preserves its selected native binders (${surface})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: genericSource([control]) });
      assert.equal(compiled.sourceDiagnosticsText, "", "the complete generic destination is source-checked, not a fabricated policy fixture");
      assert.equal(compiled.result.diagnostics.length, 0,
        `${control.name}: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal(/\bint [^()\r\n]+\.read<[^>]+>\(int\? /u.test(generated), true, "the explicit destination method retains its generic declaration");
      assert.equal(/this\.read</u.test(generated), false, "a phantom destination binder never becomes an implementation type argument");
      if (control.name === "keyword") assert.equal(generated.includes("read<@event>"), true, "the selected authored keyword uses native escaping");
      assert.equal(/\bint [^()\r\n]+\.read<[^>]+>\([^)]*\)\s*\{[^}]*\b7\b/u.test(generated), false,
        "the default initializer is never copied from its implementation into an explicit forwarding body");
    });
  }
  for (const [group, controls, presentFunction] of [
    ["complete", genericCases, "anonymous"],
    ["independent named", genericCases.filter(control => control.name !== "anonymous" && control.name !== "outer"), "named"],
  ]) {
  test(`${group} generic source project matches handwritten native observations and allocation costs (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericSource(controls) });
    assert.equal(compiled.result.diagnostics.length, 0,
      `generic project: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const observations = controls.map(control => `
if (Tsonic.Generated.Index.${control.name}(false) != 7 || Tsonic.Generated.Index.${control.name}(true) != 11)
    throw new System.Exception("${control.name}: omission, present value or single body call");`).join("\n");
    const program = `${observations}
for (int index = 0; index < 4096; index++) { _ = Tsonic.Generated.Index.named(false); _ = Tsonic.Generated.Index.${presentFunction}(true); _ = NativeBaseline.Read(false); }
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread();
long generatedSum = 0;
for (int index = 0; index < 4096; index++) generatedSum += Tsonic.Generated.Index.named(false) + Tsonic.Generated.Index.${presentFunction}(true);
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread();
long nativeSum = 0;
for (int index = 0; index < 4096; index++) nativeSum += NativeBaseline.Read(false) + NativeBaseline.Read(true);
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 4096L * 18 || nativeSum != generatedSum || generatedBytes != nativeBytes)
    throw new System.Exception($"native cost mismatch: generated={generatedBytes}, native={nativeBytes}, sums={generatedSum}/{nativeSum}");
System.Console.Write($"generic native-equivalent; generated={generatedBytes}; native={nativeBytes}");
interface NativeView { int read<T>(int? value); }
sealed class NativeBody : NativeView {
    public int Calls;
    public int read(int? value = null) { Calls++; return value ?? 7; }
    int NativeView.read<T>(int? value) { return this.read(value); }
}
static class NativeBaseline {
    public static int Read(bool present) {
        var body = new NativeBody(); NativeView view = body;
        int value = present ? view.read<string>(11) : view.read<string>(null);
        if (body.Calls != 1) return -100;
        return value;
    }
}`;
    const proof = buildNativeProject(`generic-source-${group}-${surface}`, program, compiled.artifacts);
    writeFileSync(join(proof.root, "source.ts"), genericSource(controls));
    assert.equal(proof.build.status, 0, `complete native generic project: ${String(proof.build.stdout).slice(-4096)}`);
    const executed = proof.run();
    assert.equal(executed.status, 0, `generic observations/cost: ${String(executed.stderr).slice(-4096)}`);
    assert.equal(/^generic native-equivalent; generated=\d+; native=\d+$/u.test(executed.stdout), true,
      "native allocations match exactly after warmup; no measured tolerance or wrapper allowance");
    const omitted = new Map([...compiled.artifacts].map(([path, text]) => [path,
      path.endsWith(".cs") ? text.replace(/(\bint [^()\r\n]+\.read)<[^>]+>(\(int\? )/gu, "$1$2") : text]));
    assert.equal([...omitted].some(([path, text]) => text !== compiled.artifacts.get(path)), true,
      "the native red changes an actual generated destination declaration, never a build-model error");
    const negative = buildNativeProject(`generic-omitted-binder-${group}-${surface}`, program, omitted);
    assert.equal(negative.build.status === 0, false, "the otherwise identical complete project cannot omit the destination binder");
    assert.equal(/error CS(?:0535|0539)/u.test(String(negative.build.stdout)), true,
      "Roslyn rejects the missing explicit generic implementation, not an unrelated compiler failure");
  });
  }
}
