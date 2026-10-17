import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpDelegateTargetType, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../../../dist/analysis/objects/structural-forwarding.js";
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/method-values.js";
import { planCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/declarations/interfaces/structural.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { printCsharpCompilationUnit } from "../../../dist/print/source/index.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

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
    projectTypes: { catalog: { definitionForTarget: () => undefined } },
    semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers: () => ({ kind: "available",
      destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol: sourceSymbol, rootSymbols: [] }, declarations: [declaration] },
        destination: { property: { symbol: destinationSymbol, rootSymbols: [] }, declarations: [] },
      }],
    }) } }),
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

test("structural default evidence never reads parameters from a selected property declaration", () => {
  const value = defaultEvidenceFixture("property-declaration");
  value.policy.ast.parameters = () => assert.fail("a callable member symbol cannot make a property declaration a method");
  const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination);
  assert.equal(selected === undefined, true, "a property cannot supply a method-default witness");
  assert.equal(value.parameterReads(), 0, "the actual declaration kind gates source parameter reads");
});

for (const kind of ["method-declaration", "method-signature"]) {
  test(`structural default evidence retains a selected ${kind} initializer witness`, () => {
    const value = defaultEvidenceFixture(kind);
    const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination);
    assert.equal(selected === undefined, false, "the authored method default supplies the native omission witness");
    assert.equal(value.parameterReads(), 1, "source parameters are gathered once by the analysis owner");
    assert.equal(selected.methods.length, 1, "one native method correspondence");
    assert.equal(selected.methods[0].defaultArguments.length, 1, "one initialized parameter");
    assert.equal(selected.methods[0].defaultArguments[0], 0, "the exact initialized parameter index");
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
  const selected = selectCsharpStructuralInterfaceImplementation({ sourceNode: {}, source, destination, members: [{ source: read, destination: openWrite,
    openSource: read, openDestination: openWrite, declaration: {}, parameterDefaults: [true] }] });
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
    type: csharpDelegateTargetType("System.Func", [local, outer], local), methodStorageType: stored, methodValueContract: stored,
    typeParameters: Object.freeze([{ declaration: {}, identity: local.identity, name: local.name, csharpAllowsRefLike: false,
      constraints: Object.freeze([{ kind: "type", type: outer }]) }]) });
  const selected = substituteObjectShapeMemberTargetTypeParameters(member,
    new Map([[outer.identity, integer], [local.identity, { kind: "source-primitive", name: "string" }]]));
  const signature = getCsharpDelegateSignature(selected.type);
  assert.equal(signature.parameters[0] === local && signature.returnType === local, true, "the method's own binder shadows same-named owner substitutions");
  assert.equal(signature.parameters[1] === integer, true, "the distinct outer owner argument is substituted");
  assert.equal(selected.typeParameters[0].constraints[0].type === integer, true, "the outer constraint is closed through the same helper");
  for (const field of ["methodStorageType", "methodValueContract"]) {
    const contract = getCsharpDelegateSignature(selected[field]);
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
    semanticsFor: () => ({ types: { structuralMembers(source, destination) {
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

function fixture(passingMode = "by-value") {
  const sourceType = Object.freeze({ kind: "target-named", id: "test.Source", csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  const interfaceType = Object.freeze({ kind: "target-named", id: "test.View", csharpRender: { kind: "named", name: "View" }, csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  const declaration = Object.freeze({});
  const sourceParameter = Object.freeze({});
  const incoming = Object.freeze({ name: "value", type: passingMode === "by-value" ? csharpNullableTargetType(integer) : integer,
    passingMode, ...(passingMode === "by-value" ? { optional: true } : {}) });
  const implementation = Object.freeze({ sourceDeclaration: declaration, methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]),
    parameters: Object.freeze([Object.freeze({ sourceParameter, targetParameter: incoming })]), returnType: integer });
  const signature = csharpDelegateTargetType("System.Func", [incoming.type], integer,
    passingMode === "by-value" ? { optionalParameterIndexes: [0] } : {});
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type: {
    ...signature, csharpDelegateSignature: { ...signature.csharpDelegateSignature, parameterPassingModes: Object.freeze([passingMode]) },
  } });
  const selected = Object.freeze({ sourceNode: declaration, sourceType, interfaceType, properties: Object.freeze([]), methods: Object.freeze([
    Object.freeze({ sourceName: "read", declaration, member, defaultArguments: Object.freeze(passingMode === "by-value" ? [0] : []) }),
  ]) });
  const runtimeDefault = Object.freeze({ kind: "nullable", valueType: integer, parameterType: incoming.type, acceptsOmission: true });
  let reads = 0;
  const callables = { callableDispatch: { get(node) { reads += 1; return node === declaration ? { implementation } : undefined; } } };
  const declarations = { runtimeDefault: { get(node) { reads += 1;
    return node === sourceParameter && passingMode === "by-value" ? runtimeDefault : undefined; } } };
  const policy = { ast: { parent: () => undefined, parameters: () => assert.fail("source parameter analysis cannot run again") },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined }, directSupertypes: () => [] },
    objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }),
    providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
  const shapes = { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]),
    structuralImplementations: () => Object.freeze([selected]), knownShapes: () => [] };
  return { sourceType, declaration, sourceParameter, implementation, runtimeDefault, callables, declarations, policy, shapes,
    reads: () => reads };
}

test("structural forwarding publishes canonical completed contracts and pure immutable native reads", () => {
  const value = fixture();
  const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
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
  value.callables.callableDispatch.get = () => assert.fail("canonical ABI lookup cannot be repeated after publication");
  value.declarations.runtimeDefault.get = () => assert.fail("runtime default lookup cannot be repeated after publication");
  value.shapes.structuralImplementations = () => assert.fail("logical structural selection cannot run after publication");
  assert.equal(finalized.objectShapes.structuralImplementations({ ...value.sourceType }) === selected, true, "final reader preserves native record identity");
  assert.equal(value.reads(), reads, "the final getter is a lookup only");
  assert.throws(() => finalized.objectShapes.structuralImplementations({ ...value.sourceType, typeArguments: [integer] }),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.source === "tsonic-csharp" &&
      error.message === "C# structural forwarding has no sealed record for the selected native instantiation.",
    "an impossible unadmitted generic instantiation uses the canonical analysis invariant and cannot trigger late analysis");
});

for (const missing of ["canonical method contract", "native parameter passing correspondence"]) {
  test(`structural forwarding refuses incomplete ${missing} before a backend method can be published`, () => {
    const value = fixture();
    if (missing === "canonical method contract") value.callables.callableDispatch.get = () => undefined;
    else {
      const selected = value.shapes.structuralImplementations(value.sourceType)[0];
      const method = selected.methods[0];
      const member = { ...method.member, type: { ...method.member.type,
        csharpDelegateSignature: { ...method.member.type.csharpDelegateSignature, parameterPassingModes: [] },
      } };
      value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member }] }];
    }
    const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
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
    const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
    assert.equal(finalized.issues.length, 0, "identical native passing contracts need no new adaptation capability");
    const diagnostics = [];
    const planned = planCsharpStructuralInterfaceMembers({ targetType: value.sourceType }, value.declaration, {
      program: { objectShapes: finalized.objectShapes, source: { ast: {
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
        program.sourceFiles.forEach(visit);
        assert.equal(declaration !== undefined, true, "the exact authored method remains in the sealed source domain");
        const method = program.records.callableDispatch.get(declaration)?.implementation;
        assert.equal(method?.parameters.length, 2, "unused and omittable native parameters are not dropped");
        assert.equal(method?.parameters.every(parameter => parameter.targetParameter.optional === true), true,
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
  const implementation = Object.freeze({ sourceDeclaration: declaration, methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]),
    parameters: Object.freeze(control.modes.map((passingMode, index) => Object.freeze({ sourceParameter: Object.freeze({}),
      targetParameter: Object.freeze({ name: `value${index}`, type: integer, passingMode }) }))), returnType: integer });
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type: signature,
    ...(destinationNames.length === 0 ? {} : { typeParameters: Object.freeze(destinationNames.map((name, index) => Object.freeze({
      declaration: Object.freeze({}), identity: `destination:${control.name}:${index}`, name, csharpAllowsRefLike: false, constraints: Object.freeze([]),
    }))) }),
  });
  const selected = Object.freeze({ sourceNode: declaration, sourceType, interfaceType, properties: Object.freeze([]), methods: Object.freeze([
    Object.freeze({ sourceName: "read", declaration, member, defaultArguments: Object.freeze([]) }),
  ]) });
  const policy = { ast: { parent: () => undefined, parameters: () => assert.fail("native forwarding cannot re-plan source parameters") },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined }, directSupertypes: () => [] },
    objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }),
    providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
  const finalized = finalizeCsharpStructuralInterfaceForwarding(policy,
    { issues: Object.freeze([]), structuralImplementationTypes: Object.freeze([sourceType]), structuralImplementations: () => Object.freeze([selected]) },
    { callableDispatch: { get: node => node === declaration ? { implementation } : undefined } },
    { runtimeDefault: { get: () => undefined } });
  assert.equal(finalized.issues.length, 0, `${control.name}: canonical native admission accepts exact byref parameters and an adapted result`);
  const forwarding = finalized.objectShapes.structuralImplementations(sourceType)[0]?.methods[0]?.forwarding;
  assert.equal(forwarding?.implementation === implementation, true, `${control.name}: exact canonical physical method identity`);
  assert.equal(forwarding?.result.conversion.kind, "implicit", `${control.name}: the result is genuinely adapted, not identity`);
  assert.equal(forwarding?.result.conversion.proof, "numeric", `${control.name}: native int32-to-int64 widening`);
  assert.equal(forwarding?.parameters.every(adapter => adapter.kind === "value" && adapter.adapter.conversion.kind === "identity"), true,
    `${control.name}: byref values never convert, copy or acquire a temporary`);
  const diagnostics = [];
  const planned = planCsharpStructuralInterfaceMembers({ targetType: sourceType }, declaration, {
    program: { objectShapes: finalized.objectShapes, source: { ast: { getSourceFile: () => ({}),
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
  assert.equal(implementation.methodTypeParameterIdentities.length, 0, `${control.name}: the actual implementation is nongeneric`);
  assert.equal(implementation.methodAllowsRefLikeTypeArguments.length, 0, `${control.name}: exact zero-arity implementation metadata remains required`);
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
