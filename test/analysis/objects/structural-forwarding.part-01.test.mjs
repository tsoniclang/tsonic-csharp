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
import { unexpectedNativeDispatchRead, emptyNativeDispatch, integer, noAuthoredNativeMethod, defaultEvidenceFixture, structuralInterfaceRecords, sourceContract, fixture, nativeBoundBase, nativeBoundDerived, genericBoundFixture, programs, nativeModes, adaptedNativeForwarder, nativeProofSource, buildNativeProof, buildNativeProject, genericCases, genericSource } from "./structural-forwarding.fixtures.mjs";

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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: native class delegate fields retain their authored object initializer`,
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
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: selected method slots cache one native extraction and preserve rest receivers`,
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
}

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
    source: Object.freeze({ ast: Object.freeze({ is: Object.freeze({}) }) }),
    nodes: Object.freeze([]),
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

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, action, fixed] of Array.from([
    ["exported readonly method", "return value;", true],
    ["source alias replacement", "const alias = value; alias.read = () => 11; return value;", false],
    ["same-value alias write", "const alias = value; alias.read = value.read; return value;", false],
  ]).slice(0, 3)) {
test(`${surface}: ${name} retains its actual native exposure and checked writes`, { timeout: 300_000 }, () => {
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
}

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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, action, fixed] of Array.from([
    ["exported readonly method", "return value;", true],
    ["source alias replacement", "const alias = value; alias.read = () => 11; return value;", false],
    ["same-value alias write", "const alias = value; alias.read = value.read; return value;", false],
  ]).slice(0, 1)) {
test(`${surface}: ${name} retains its actual native exposure and checked writes`, { timeout: 300_000 }, () => {
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
}
}
