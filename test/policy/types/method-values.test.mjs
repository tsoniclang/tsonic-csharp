import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpMethodValueType, csharpMethodValueCoversContract, csharpMethodValueContractsEqual,
  csharpPresentObjectShapeMethod,
} from "../../../dist/target-model/types/method-values.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpObjectShapeContractKey, csharpObjectShapeMemberContractKey, csharpObjectShapeMemberTypeKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { substituteTargetTypeParameters, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { retainCsharpMethodValueContracts, selectCsharpWritableMethodContract } from "../../../dist/analysis/objects/shapes/method-values.js";
import { csharpCopiedObjectShapeMembers } from "../../../dist/policy/types/objects/method-environments.js";
import { selectCsharpObjectMemberEmission, selectCsharpObjectMethodSignature } from "../../../dist/policy/types/objects/object-members.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { analyzeCsharpStructuralObjectEmission } from "../../../dist/analysis/objects/structural-emission.js";
import { renderObjectShapeMembers } from "../../../dist/backend/planner/objects/members.js";
import { renderCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/objects/structural-interfaces.js";
import { renderCsharpMethodValueContracts } from "../../../dist/backend/planner/objects/method-values.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/object-shape-keys.js";
import { analyzeCsharpCaptureMethods } from "../../../dist/analysis/objects/capture-methods.js";
import { printCsharpCompilationUnit, printCsharpStatement } from "../../../dist/print/source/printer.js";
import { objectShapeMethodInvocationName } from "../../../dist/target-model/names/object-members.js";

const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "tsonic.shape:owner", typeArguments: [{ kind: "type-parameter", identity: "Outer", name: "Outer" }],
  csharpRender: { kind: "named", name: "Owner" } };
function contract(name) {
  const type = { kind: "type-parameter", identity: name, name };
  return csharpDelegateTargetType("System.Func", [type], type);
}
const methodValue = (name, method = "identity") => csharpMethodValueType(owner, method, method, contract(name), [name]);
const unconstrained = () => ({ kind: "resolved", constraints: [] });
const abstractMethodStorage = Object.freeze({
  memberSubjectFor: () => assert.fail("a quantified abstract contract has no ordinary authored method slot"),
  memberWritesFor: () => assert.fail("a quantified abstract contract needs no ordinary-method exposure proof"),
});

test("native writable method contracts derive from the unchanged read-only identity", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  for (const optional of [false, true]) {
    const signature = csharpDelegateTargetType("System.Func", [], scalar);
    const member = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
      memberKind: "method", type: optional ? csharpNullableTargetType(signature) : signature,
      ...(optional ? { optional: true } : {}) };
    const base = { targetType: createStructuralObjectShapeTarget([member], undefined, unconstrained, true), members: [member] };
    const selected = selectCsharpWritableMethodContract(base, [member], unconstrained);
    assert.equal(selected !== undefined, true, "an exact writable destination has a native derived contract");
    assert.equal(targetTypeRefEquals(selected.targetType, base.targetType), false, "write capability has distinct physical native identity");
    assert.equal(targetTypeRefEquals(selected.implements[0], base.targetType), true, "the writable native contract inherits the same base");
    assert.equal(base.members[0].methodValueStorage, undefined, "read-only peers retain direct method bodies and no slot");
    assert.equal(selected.members[0].methodValueStorage.kind, "delegate", "a native monomorphic slot retains its exact delegate");
    assert.equal(targetTypeRefEquals(selected.members[0].methodValueStorage.type, member.type), true,
      "optional method storage has exactly the original single absence");
    assert.equal(selectCsharpWritableMethodContract(selected, [selected.members[0]], unconstrained), selected,
      "selecting an already writable destination is idempotent");
    assert.equal(selectCsharpWritableMethodContract(base, [], unconstrained), base, "call-only destination remains the exact base");
    assert.equal(selectCsharpWritableMethodContract(base, [{ ...member }], unconstrained), undefined,
      "foreign member identity is rejected rather than matched by spelling");
    const readonly = { ...member, readonly: true };
    assert.equal(selectCsharpWritableMethodContract({ ...base, members: [readonly] }, [readonly], unconstrained), undefined,
      "the derived native facet cannot override a real readonly source contract");
  }
});

test("native write-consuming interfaces require real producer slots and emit real setter forwarding", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  const member = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [], scalar) };
  const base = { targetType: createStructuralObjectShapeTarget([member], undefined, unconstrained, true), members: [member] };
  const writable = selectCsharpWritableMethodContract(base, [member], unconstrained);
  const stored = { ...member, methodValueStorage: { kind: "delegate", type: member.type } };
  const makeProducer = current => ({ targetType: createStructuralObjectShapeTarget([current], [writable.targetType], unconstrained),
    members: [current], implements: [writable.targetType] });
  for (const current of [member, stored]) {
    const producer = makeProducer(current);
    const shapes = [base, writable, producer];
    const selected = analyzeCsharpStructuralObjectEmission({
      shapes: { knownShapes: () => shapes, resolveTarget: type => shapes.find(shape => targetTypeRefEquals(shape.targetType, type)) },
      demand: { artifacts: [], get: key => ({ capabilities: ["method-values"], receiverBoundMethodKeys: [],
        materialization: key === objectShapeArtifactKey(producer) ? "synthetic" : "declared" }) },
      storage: { nativeField: { get: () => undefined } },
    });
    const valid = current === stored;
    assert.equal(selected.issues.length, valid ? 0 : 1,
      "a getter-only fixed body is not silently made to implement a writable native contract");
    const baseMember = selected.records.structuralObject.get(base).members.find(value => value.kind === "property");
    const writableMember = selected.records.structuralObject.get(writable).members.find(value => value.kind === "property");
    assert.equal(baseMember.property.writable, false, "the unchanged base never acquires a global setter");
    assert.equal(writableMember.property.writable, true, "the derived interface explicitly declares a native writable handle");
    if (!valid) {
      assert.equal(selected.issues[0].message.includes("actual writable callable slot"), true,
        "the producer-contract mismatch is refused before sealing");
      continue;
    }
    const records = { ...selected.records };
    const native = renderCsharpMethodValueContracts(producer, { program: { records }, scope: {} });
    const setter = native.find(property => property.setter !== undefined);
    assert.equal(setter !== undefined, true, "a writable native implementation has an actual setter");
    assert.equal(setter.setter.statements.length, 1, "forwarding performs one existing slot assignment");
    const assignment = setter.setter.statements[0].expression;
    assert.equal(assignment.kind === "AssignmentExpression" && assignment.right.name === "value", true,
      "the written callable is neither discarded nor replaced by an unrelated body");
    assert.equal(assignment.left.name, setter.getter.statements[0].expression.name,
      "reads and writes forward to the identical existing current slot");
  }
});

test("an optional native method keeps its immutable present body distinct from its nullable current slot", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  const declaration = {};
  const method = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [], scalar), sourceDeclarations: [declaration] };
  const protocol = createStructuralObjectShapeTarget([method], undefined, unconstrained, true);
  const present = { ...method, methodValueContract: protocol };
  const protocolShape = { targetType: protocol, members: [present] };
  const optional = { ...present, optional: true };
  const base = { targetType: createStructuralObjectShapeTarget([optional], undefined, unconstrained, true), members: [optional] };
  const writable = selectCsharpWritableMethodContract(base, [optional], unconstrained);
  const stored = { ...optional, methodValueStorage: { kind: "protocol", type: csharpNullableTargetType(protocol),
    invocationName: objectShapeMethodInvocationName(optional) } };
  const producer = { targetType: createStructuralObjectShapeTarget([stored], [writable.targetType, protocol], unconstrained),
    members: [stored], implements: [writable.targetType, protocol],
    methodImplementation: { declaration: {}, methods: [declaration], captures: [] } };
  const shapes = [protocolShape, base, writable, producer];
  const selected = analyzeCsharpStructuralObjectEmission({
    shapes: { knownShapes: () => shapes, resolveTarget: type => shapes.find(shape => targetTypeRefEquals(shape.targetType, type)) },
    demand: { artifacts: [], get: key => ({ capabilities: ["method-values"], receiverBoundMethodKeys: [],
      materialization: key === objectShapeArtifactKey(producer) ? "synthetic" : "declared" }) },
    storage: { nativeField: { get: () => undefined } },
  });
  assert.equal(selected.issues.length, 0, "both exact native roles have a complete existing implementation");
  const contracts = selected.records.structuralObject.get(producer).contracts;
  const body = contracts.find(value => targetTypeRefEquals(value.interface, protocol));
  const current = contracts.find(value => targetTypeRefEquals(value.interface, writable.targetType));
  assert.equal(body?.source, "this", "the original present callable cannot become absent after the current slot is cleared");
  assert.equal(targetTypeRefEquals(body.type, protocol), true, "the immutable present body retains its nonnullable protocol");
  assert.equal(current?.writable, true, "the separate existing native writer facet retains its actual setter");
  assert.equal(current?.source !== "this", true, "current extraction never turns a writable whole object into its original body");
  assert.equal(targetTypeRefEquals(current.type, csharpNullableTargetType(protocol)), true,
    "current slot keeps the one native absence, not a nonnullable original-body promise");
});

test("a captured source body cannot acquire reference-return or parameter semantics from a contextual protocol", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  const declaration = {};
  const file = {};
  const shape = { targetType: owner, members: [] };
  const ast = { getSourceFile: () => file, is: { IsFunctionDeclaration: () => false, IsArrowFunction: () => true } };
  const ordinary = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const input = { sourceParameter: {}, targetParameter: { name: "value", type: scalar, passingMode: "by-value" } };
  const body = { kind: "source", sourceDeclaration: declaration, nativeParameters: [input], returnType: scalar };
  const observe = (signature, admittedBody = body) => {
    const type = { ...ordinary, id: "native:CapturedCallback", csharpRender: { kind: "named", name: "CapturedCallback" },
      csharpDelegateSignature: signature };
    const method = { declaration, methodName: "invoke", type, captures: [], receivers: [] };
    return analyzeCsharpCaptureMethods(ast, { frames: [{ shape, methods: [method] }] },
      { resolveTarget: () => undefined }, { get: () => admittedBody });
  };
  const ordinaryResult = observe(ordinary.csharpDelegateSignature);
  assert.equal(ordinaryResult.issues.length, 0, "the actual ordinary value body remains admitted");
  assert.equal(ordinaryResult.records.captureMethods.get(shape)[0].signature.returnPassing, undefined,
    "the sealed source body has an explicitly proved value return, not an erased native alias");
  for (const returnPassing of ["byref-readwrite", "byref-readonly"]) {
    const result = observe({ ...ordinary.csharpDelegateSignature, returnPassing });
    assert.equal(result.issues.length, 1, "a value body cannot acquire an unproved native reference return");
    assert.equal(result.records.captureMethods.get(shape).length, 0, "no mismatching native capture body is published");
    assert.equal(result.issues[0].sourceNode === declaration && result.issues[0].message.includes("source body"), true,
      "a precise original-body admission rejection occurs before the renderer");
  }
  const referenceInput = { ...ordinary.csharpDelegateSignature, parameterPassingModes: ["byref-readwrite"] };
  assert.equal(observe(referenceInput).issues.length, 1, "a contextual reference parameter cannot replace the original value ABI");
  const matchingBody = { ...body, nativeParameters: [{ ...input, targetParameter: { ...input.targetParameter, passingMode: "byref-readwrite" } }] };
  assert.equal(observe(referenceInput, matchingBody).issues.length, 0,
    "an independently admitted matching native parameter contract is retained, not blanket-prohibited");
  assert.equal(observe(ordinary.csharpDelegateSignature, matchingBody).issues.length, 1,
    "a native reference body cannot acquire contextual by-value parameter semantics");
  const extraDefault = { ...input, targetParameter: { ...input.targetParameter, name: "defaulted", optional: true } };
  assert.equal(observe(ordinary.csharpDelegateSignature, { ...body, nativeParameters: [input, extraDefault] }).issues.length, 0,
    "a by-value default correspondence is not rejected by native-vector length alone");
  assert.equal(observe({ ...ordinary.csharpDelegateSignature, parameters: [scalar, scalar],
    parameterPassingModes: ["by-value", "by-value"] }).issues.length, 0,
  "a by-value contextual vector is not rejected by native-vector length alone");
  assert.equal(observe({ ...ordinary.csharpDelegateSignature, parameters: [scalar, scalar],
    parameterPassingModes: ["by-value", "byref-readwrite"] }).issues.length, 1,
  "a new contextual reference slot requires a corresponding actual native body binding");
  assert.equal(observe(ordinary.csharpDelegateSignature, { ...body, nativeParameters: [input,
    { ...extraDefault, targetParameter: { ...extraDefault.targetParameter, passingMode: "byref-readwrite" } }] }).issues.length, 1,
  "a native reference slot cannot disappear behind a shorter contextual by-value vector");
  assert.equal(observe(ordinary.csharpDelegateSignature, { ...body, sourceDeclaration: {} }).issues.length, 1,
    "a same-shaped foreign body is not substituted for the actual checked declaration");
});

test("a quantified method reference renders only its existing native environment", () => {
  const value = methodValue("Item");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.csharpMethodValue), true);
  assert.equal(Object.isFrozen(value.csharpMethodValue.typeParameters), true);
  assert.deepEqual(csharpTypeFromTargetTypeRef(value), csharpTypeFromTargetTypeRef(owner));
  assert.equal(targetTypeRefEquals(value, owner), false);
  assert.equal(targetTypeRefEquals(value, methodValue("Item", "other")), false);
  assert.equal(csharpMethodValueCoversContract(value, contract("Item")), true);
  assert.equal(csharpMethodValueCoversContract(value, csharpDelegateTargetType("System.Action", [])), false);
});

test("nullable quantified callable storage renders the original environment with one native absence", () => {
  const value = methodValue("Item");
  const nullable = csharpNullableTargetType(value);
  const rendered = csharpTypeFromTargetTypeRef(nullable);
  assert.deepEqual(rendered, { kind: "NullableType", inner: csharpTypeFromTargetTypeRef(value) });
  assert.deepEqual(csharpTypeFromTargetTypeRef(csharpNullableTargetType(nullable)), rendered);
  const scalar = { kind: "source-primitive", name: "float64" };
  const selected = substituteTargetTypeParameters(nullable, new Map([["Outer", scalar]]));
  assert.deepEqual(csharpTypeFromTargetTypeRef(selected), {
    kind: "NullableType", inner: csharpTypeFromTargetTypeRef(substituteTargetTypeParameters(value, new Map([["Outer", scalar]]))),
  });
});

test("free environment substitution cannot capture the method's own quantifiers", () => {
  const value = methodValue("Item");
  const scalar = { kind: "source-primitive", name: "float64" };
  const selected = substituteTargetTypeParameters(value, new Map([["Outer", scalar], ["Item", scalar]]));
  assert.deepEqual(selected.csharpMethodValue.owner.typeArguments, [scalar]);
  assert.deepEqual(selected.csharpMethodValue.contract, contract("Item"));
  assert.equal(csharpMethodValueContractsEqual(value, methodValue("Other")), true);
  assert.equal(csharpMethodValueContractsEqual(value, methodValue("Item", "different")), false);
});

test("method references require exact native reference ownership and unique quantifiers", () => {
  const scalar = { kind: "source-primitive", name: "float64" };
  const signature = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const monomorphic = csharpMethodValueType(owner, "identity", "identity", signature, []);
  assert.deepEqual(monomorphic.csharpMethodValue.typeParameters, []);
  assert.equal(csharpMethodValueCoversContract(monomorphic, signature), true);
  assert.equal(csharpMethodValueType({ ...owner, csharpValueType: true }, "identity", "identity", contract("Item"), ["Item"]), undefined);
  assert.equal(csharpMethodValueType(owner, "identity", "identity", contract("Item"), []), undefined);
  assert.equal(csharpMethodValueType(owner, "identity", "identity", contract("Item"), ["Item", "Item"]), undefined);
  assert.equal(csharpMethodValueType({ ...owner, id: "Nominal" }, "identity", "identity", contract("Item"), ["Item"]), undefined);
});

test("optional native method storage retains a required present protocol without weakening member identity", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", optional: true, type: csharpNullableTargetType(contract("Item")),
    typeParameters: [{ csharpAllowsRefLike: false, identity: "Item", name: "Item", declaration: {}, constraints: [] }] };
  const recorded = [];
  const shape = retainCsharpMethodValueContracts({ targetType: { ...owner, csharpStructuralContract: true }, members: [member] },
    fact => { recorded.push(fact); return fact; }, unconstrained, abstractMethodStorage);
  assert.equal(shape.members[0].optional, true);
  assert.equal(recorded[0].members[0].optional, undefined);
  assert.equal(getCsharpNullableElementTargetType(recorded[0].members[0].type), undefined);
  assert.equal(shape.implements, undefined);
  const repeated = retainCsharpMethodValueContracts({ ...shape, implements: [recorded[0].targetType] },
    fact => fact, unconstrained, abstractMethodStorage);
  assert.equal(repeated.implements, undefined, "an optional interface cannot acquire its present-only invocation protocol from a prior decoration");
  assert.equal(csharpObjectShapesEqual(shape, repeated), true, "repeated publication preserves the same complete physical interface contract");
  assert.notEqual(csharpObjectShapeMemberContractKey(member), csharpObjectShapeMemberContractKey(recorded[0].members[0]));
  assert.deepEqual(csharpPresentObjectShapeMethod(member).type, contract("Item"));
  assert.equal(csharpPresentObjectShapeMethod({ ...member, memberKind: "property" }), undefined);
  assert.equal(csharpPresentObjectShapeMethod({ ...member, type: owner }), undefined);
  for (const changed of [{ ...member, targetName: "other" }, { ...member, bound: true },
    { ...member, sourceKey: { kind: "property", name: "other" } }]) {
    assert.notEqual(csharpObjectShapeMemberContractKey(csharpPresentObjectShapeMethod(changed)),
      csharpObjectShapeMemberContractKey(csharpPresentObjectShapeMethod(member)));
  }
});

test("copied generic methods retain only the exact original environment and minimal method contract", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: contract("Item"), typeParameters: [{ csharpAllowsRefLike: false, identity: "Item", name: "Item", declaration: {}, constraints: [] }] };
  const recorded = [];
  const shape = retainCsharpMethodValueContracts({ targetType: owner, members: [member],
    methodImplementation: { declaration: {}, identity: "body", methods: [], captures: [] } }, fact => { recorded.push(fact); return fact; },
  unconstrained, abstractMethodStorage);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].members.length, 1);
  assert.equal(targetTypeRefEquals(recorded[0].targetType, shape.members[0].methodValueContract), true);
  const copiedBody = csharpCopiedObjectShapeMembers(shape)[0].methodValueStorage;
  assert.equal(copiedBody.kind, "protocol", "a copied native body has an exact invocation descriptor");
  assert.equal(targetTypeRefEquals(copiedBody.type, owner), true);
  assert.equal(copiedBody.invocationName, "identity", "the concrete native body keeps its real direct method entry");
  const copiedMember = csharpCopiedObjectShapeMembers(shape)[0];
  const copiedSelection = selectCsharpObjectMemberEmission({ shape: { targetType: owner, members: [copiedMember] }, member: copiedMember,
    receiverBound: false, authored: false, deferred: false, implementsInterface: true, nativeField: undefined });
  assert.equal(copiedSelection.kind === "selected" && copiedSelection.value.declaration.kind === "copied", true,
    "a concrete native environment retains its canonical copied-method declaration");
  assert.equal(copiedSelection.value.declaration.invocationName, "identity", "the field invokes its actual concrete native method");
  assert.equal(copiedSelection.value.declaration.bodyInvocationName, "__tsonic_invoke_body_identity",
    "the implemented protocol has a separately selected immutable entry");
  assert.equal(targetTypeRefEquals(copiedSelection.value.declaration.interface, shape.members[0].methodValueContract), true,
    "an explicit protocol implementation never mistakes the concrete native environment for an interface");
  const abstract = retainCsharpMethodValueContracts({ targetType: { ...owner, id: "tsonic.shape:interface", csharpStructuralContract: true },
    members: [member, { sourceKey: { kind: "property", name: "extra" }, sourceName: "extra", targetName: "extra",
      memberKind: "property", type: { kind: "source-primitive", name: "float64" } }] }, fact => fact, unconstrained, abstractMethodStorage);
  const copied = csharpCopiedObjectShapeMembers(abstract);
  assert.equal(targetTypeRefEquals(copied[0].methodValueStorage.type, shape.members[0].methodValueContract), true);
  assert.equal(copied[0].methodValueStorage.invocationName, "__tsonic_invoke_body_identity", "a protocol copy retains its immutable entry");
  assert.equal(copied[1].methodValueStorage, undefined);
  const instantiated = substituteObjectShapeFactTargetTypeParameters({ ...shape, members: csharpCopiedObjectShapeMembers(shape) },
    new Map([["Outer", { kind: "source-primitive", name: "string" }]]));
  assert.equal(instantiated.members[0].methodValueStorage.type.typeArguments[0].name, "string");
  assert.equal(instantiated.members[0].methodValueStorage.invocationName, "identity", "substitution preserves the selected native entry");
  assert.equal(instantiated.members[0].typeParameters[0].name, "Item");
});

test("native method-value storage identity includes the exact immutable invocation entry", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: contract("Item"), methodValueStorage: { kind: "protocol", type: owner, invocationName: "identity" } };
  const shape = { targetType: owner, members: [member] };
  const same = { ...shape, members: [{ ...member, methodValueStorage: { ...member.methodValueStorage } }] };
  const other = { ...shape, members: [{ ...member, methodValueStorage: { ...member.methodValueStorage, invocationName: "other" } }] };
  assert.equal(csharpObjectShapesEqual(shape, same), true, "equal native receiver and entry have one physical storage contract");
  assert.equal(csharpObjectShapeContractKey(shape), csharpObjectShapeContractKey(same), "equal storage has one canonical shape key");
  assert.equal(csharpObjectShapesEqual(shape, other), false, "a different method on the same native receiver is not the same callable");
  assert.notEqual(csharpObjectShapeContractKey(shape), csharpObjectShapeContractKey(other), "physical shape keys cannot erase invocation identity");
  assert.equal(targetTypeRefEquals(createStructuralObjectShapeTarget(shape.members, undefined, unconstrained),
    createStructuralObjectShapeTarget(same.members, undefined, unconstrained)), true,
  "one physical receiver and immutable entry produce one native object declaration");
  assert.equal(targetTypeRefEquals(createStructuralObjectShapeTarget(shape.members, undefined, unconstrained),
    createStructuralObjectShapeTarget(other.members, undefined, unconstrained)), false,
  "native object declaration identity includes its required invocation selection");
  const copied = csharpCopiedObjectShapeMembers({ ...shape, members: [{ ...member, optional: true,
    methodValueStorage: { ...member.methodValueStorage, type: csharpNullableTargetType(owner) } }] });
  assert.equal(copied[0].methodValueStorage.invocationName, "identity", "a copied optional value retains its original native entry");
  const optionalStorage = copied[0].methodValueStorage.type;
  const presentStorage = getCsharpNullableElementTargetType(optionalStorage);
  assert.equal(isCsharpNullableReferenceTargetType(optionalStorage), true, "optional storage has its actual nullable reference annotation");
  assert.equal(presentStorage !== undefined && targetTypeRefEquals(presentStorage, owner), true,
    "optional native method storage retains exactly its one physical absence state");
  assert.equal(getCsharpNullableElementTargetType(presentStorage) === undefined, true, "unwrapping removes the single native absence");
});

function nativeModeMember(identity, modes, returnPassing) {
  const parameter = { kind: "type-parameter", identity, name: identity };
  const type = { kind: "target-named", id: "NativeContract`1", typeArguments: [parameter], csharpAllowsRefLikeTypeArguments: [false],
    csharpRender: { kind: "named", name: "NativeContract", genericArity: 1 }, csharpDelegateSignature: {
      parameters: modes.map(() => parameter), parameterPassingModes: modes, returnType: parameter, returnPassing,
    } };
  return { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type, typeParameters: [{ csharpAllowsRefLike: false, identity, name: identity, declaration: {}, constraints: [] }] };
}

test("one generated native protocol identity includes its complete invocation modes with alpha correspondence", () => {
  const plain = nativeModeMember("Item", ["by-value"], undefined);
  const plainAlpha = nativeModeMember("Other", ["by-value"], undefined);
  assert.equal(csharpObjectShapeMemberTypeKey(plain), JSON.stringify(["target:NativeContract`1<bound-type-parameter:0>", [[]]]),
    "ordinary by-value native protocol keys stay byte-identical to their previous physical-key and constraint encoding");
  assert.equal(csharpObjectShapeMemberTypeKey(plain), csharpObjectShapeMemberTypeKey(plainAlpha),
    "ordinary by-value protocols retain their existing alpha-equivalent identity");
  const seen = new Set([csharpObjectShapeMemberTypeKey(plain)]);
  const identities = new Set([createStructuralObjectShapeTarget([plain], undefined, unconstrained, true).id]);
  for (const [mode, result] of [["byref-readonly", undefined], ["byref-readwrite", undefined],
    ["byref-writeonly-must-init", undefined], ["by-value", "byref-readwrite"], ["by-value", "byref-readonly"]]) {
    const member = nativeModeMember("Item", [mode], result);
    const alpha = nativeModeMember("Other", [mode], result);
    assert.equal(targetTypeRefEquals(member.type, plain.type), true, "physical native delegate equality is deliberately unchanged");
    const key = csharpObjectShapeMemberTypeKey(member);
    assert.equal(key === csharpObjectShapeMemberTypeKey(alpha), true, "the exact invocation ABI alpha-rebinds its own input and return together");
    assert.equal(seen.has(key), false, `${mode}/${result ?? "value"}: a distinct native mode cannot share a generated protocol contract`);
    seen.add(key);
    const generated = createStructuralObjectShapeTarget([member], undefined, unconstrained, true);
    assert.equal(identities.has(generated.id), false, "the actual generated native interface identity also distinguishes the mode");
    identities.add(generated.id);
    assert.equal(csharpObjectShapeContractKey({ targetType: owner, members: [member] }) ===
      csharpObjectShapeContractKey({ targetType: owner, members: [alpha] }), true, "shape correspondence uses the same alpha-aware owner key");
    assert.equal(csharpObjectShapesEqual({ targetType: owner, members: [plain] }, { targetType: owner, members: [member] }), false,
      "canonical shape equality never erases a different admitted invocation mode");
    const value = csharpMethodValueType(owner, "identity", "identity", member.type, ["Item"]);
    const ordinary = csharpMethodValueType(owner, "identity", "identity", plain.type, ["Item"]);
    const alphaValue = csharpMethodValueType(owner, "identity", "identity", alpha.type, ["Other"]);
    assert.equal(csharpMethodValueCoversContract(value, plain.type), false,
      "native protocol coverage independently rejects a mode mismatch despite physical delegate identity");
    assert.equal(csharpMethodValueContractsEqual(value, ordinary), false,
      "capture/body protocol correspondence never accepts a different native invocation mode");
    assert.equal(csharpMethodValueContractsEqual(value, alphaValue), true,
      "exact native protocol correspondence still alpha-rebinds the complete signature");
  }
  assert.equal(selectCsharpObjectMethodSignature({ ...plain.type,
    csharpDelegateSignature: { ...plain.type.csharpDelegateSignature, parameterPassingModes: [] } }) === undefined, true,
  "missing native passing evidence is rejected instead of becoming a value argument");
});

for (const returnPassing of [undefined, "byref-readwrite", "byref-readonly"]) {
  test(`copied and current native protocol forwarding retain all input modes and ${returnPassing ?? "value"} return`, () => {
    const modes = ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"];
    const member = nativeModeMember("Item", modes, returnPassing);
    const protocol = createStructuralObjectShapeTarget([member], undefined, unconstrained, true);
    const protocolShape = { targetType: protocol, members: [{ ...member, methodValueContract: protocol }] };
    for (const authored of [false, true]) {
      const declaration = {};
      const selectedMember = { ...member, sourceDeclarations: [declaration], methodValueContract: protocol,
        methodValueStorage: { kind: "protocol", type: authored ? protocol : owner,
          invocationName: authored ? objectShapeMethodInvocationName(member) : "identity" } };
      const shape = { targetType: owner, members: [selectedMember],
        methodImplementation: { declaration: {}, identity: "actual-native-body", methods: [declaration], captures: [] } };
      const selection = selectCsharpObjectMemberEmission({ shape, member: selectedMember, receiverBound: false, authored,
        deferred: false, implementsInterface: false, nativeField: undefined });
      assert.equal(selection.kind === "selected" && selection.value.declaration.kind === (authored ? "authored" : "copied"), true,
        "the existing owner admits the native forwarding contract without a by-value-only restriction");
      const signature = selection.value.declaration.signature;
      assert.equal(signature.parameters.every((parameter, index) => parameter.passingMode === modes[index]) &&
        signature.returnPassing === returnPassing, true, "object member publication retains every exact native passing mode");
      const shapes = [shape, protocolShape];
      const structural = analyzeCsharpStructuralObjectEmission({ shapes: { knownShapes: () => shapes,
        resolveTarget: type => shapes.find(candidate => targetTypeRefEquals(candidate.targetType, type)) },
      demand: { artifacts: [], get: () => undefined }, storage: { nativeField: { get: () => undefined } } });
      assert.equal(structural.issues.length, 0, "complete native signature evidence is admitted before syntax rendering");
      const records = { ...structural.records, nativeMemberHiding: { get: () => false },
        objectMemberDeclarations: { get: () => [selection.value] } };
      const interfaceMembers = renderCsharpStructuralInterfaceMembers(undefined, protocolShape, records);
      const members = renderObjectShapeMembers(undefined, shape, records);
      const expected = [undefined, "in", "ref", "out"];
      const returning = returnPassing === undefined ? undefined : returnPassing === "byref-readonly" ? "ref-readonly" : "ref";
      for (const method of [...interfaceMembers, ...members.filter(candidate => candidate.kind === "MethodDeclaration")]) {
        assert.equal(method.returnPassing === returning && method.parameters.every((parameter, index) => parameter.passing === expected[index]),
          true, "native interface, current dispatch and copied immutable entry retain the same declaration modes");
        const visit = statement => {
          if (statement.kind === "IfStatement") statement.thenBody.statements.forEach(visit);
          if (statement.kind !== "ReturnStatement") return;
          assert.equal(statement.ref === true, returnPassing !== undefined, "the forwarding return retains an actual native alias, not a value copy");
          assert.equal(statement.expression.arguments.every((argument, index) => argument.passing === expected[index]), true,
            "every original/current/copied native call passes in/ref/out exactly as sealed");
        };
        method.body?.statements.forEach(visit);
      }
      const output = printCsharpCompilationUnit({ kind: "CompilationUnit", usings: [], members: [
        { kind: "InterfaceDeclaration", name: "NativeProtocol", modifiers: ["public"], members: interfaceMembers },
        { kind: "ClassDeclaration", name: "NativeImplementation", modifiers: ["public"], members },
      ] });
      const prefix = returning === undefined ? "" : returning === "ref-readonly" ? "ref readonly " : "ref ";
      assert.equal(output.includes(`${prefix}Item identity<Item>(Item arg0, in Item arg1, ref Item arg2, out Item arg3)`), true,
        "the native printer renders the complete signature rather than inferring or erasing modes");
      assert.equal(output.includes("arg0, in arg1, ref arg2, out arg3)"), true, "native forwarding argument spelling is exact");
      assert.equal(output.includes("return ref "), returnPassing !== undefined, "only admitted reference returns print return ref");
    }
  });
}

test("native reference-return syntax cannot silently degrade to a bare return", () => {
  assert.throws(() => printCsharpStatement({ kind: "ReturnStatement", ref: true }),
    error => error.message.includes("native reference return operand"), "a missing alias operand remains an internal syntax failure");
});
