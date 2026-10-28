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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, action, fixed] of Array.from([
    ["exported readonly method", "return value;", true],
    ["source alias replacement", "const alias = value; alias.read = () => 11; return value;", false],
    ["same-value alias write", "const alias = value; alias.read = value.read; return value;", false],
  ]).slice(1, 3)) {
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

test("a native rest-copy layout stores the required invocation protocol without inventing a body", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const sourceType = Object.freeze({});
  const signature = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "run" }),
    sourceName: "run", targetName: "run", memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer) });
  const selectedContract = createStructuralObjectShapeTarget([signature], undefined,
    () => assert.fail("the selected monomorphic protocol has no free native binder"), true);
  const schema = Object.freeze({ targetType: Object.freeze({ kind: "target-named", id: "tsonic.shape:rest-schema",
    csharpGeneratedStructuralStorage: true, csharpAllowsRefLikeTypeArguments: Object.freeze([]) }),
    sourceType, members: Object.freeze([Object.freeze({ ...signature, methodValueContract: selectedContract })]) });
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
  assert.equal(copy.sourceType === sourceType, true,
    "the copied physical layout retains its exact checked source type for pre-seal structural view publication");
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

test("structural correspondence never reads parameters from a selected property declaration", () => {
  const value = defaultEvidenceFixture("property-declaration");
  value.policy.ast.parameters = () => assert.fail("a callable member symbol cannot make a property declaration a method");
  const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination);
  assert.equal(selected === undefined, true, "a property cannot supply a method-default witness");
  assert.equal(value.parameterReads(), 0, "the actual declaration kind gates source parameter reads");
});

for (const kind of Array.from(["method-declaration", "method-signature"]).slice(0, 2)) {
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

for (const control of Array.from([
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
]).slice(0, 10)) {
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

for (const control of Array.from([
  { name: "identical declared permissions", body: [false], destination: [false], accepted: true, bridges: 0 },
  { name: "a body permitting ref structs accepts an ordinary destination", body: [true], destination: [false], accepted: true, bridges: 1 },
  { name: "a ref-struct destination cannot call an ordinary body", body: [false], destination: [true], accepted: false },
  { name: "missing body permission is not false", body: [], destination: [false], accepted: false },
  { name: "missing destination permission is not false", body: [false], destination: [], accepted: false },
]).slice(0, 5)) {
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

for (const missing of Array.from(["canonical method contract", "native parameter passing correspondence"]).slice(0, 2)) {
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

for (const passingMode of Array.from(["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]).slice(0, 4)) {
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [name, source, literalCount] of Array.from(programs).slice(0, 4)) {
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

for (const control of Array.from(nativeModes).slice(0, 4)) {
test(`structural ${control.name} forwarding preserves every passing slot with an adapted native result`, () => {
    adaptedNativeForwarder(control);
  });
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

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const control of Array.from(genericCases).slice(0, 8)) {
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

for (const [group, controls, presentFunction] of Array.from([
    ["complete", genericCases, "anonymous"],
    ["independent named", genericCases.filter(control => control.name !== "anonymous" && control.name !== "outer"), "named"],
  ]).slice(0, 2)) {
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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const control of Array.from(genericCases).slice(0, 8)) {
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
}
