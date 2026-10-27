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

const unexpectedNativeDispatchRead = () => assert.fail("this structural fixture has no authored native dispatch domain");

const emptyNativeDispatch = Object.freeze({
  names: Object.freeze({ resolve: unexpectedNativeDispatchRead }),
  storage: Object.freeze({ storageType: Object.freeze({ get: unexpectedNativeDispatchRead }) }),
  nativeUse: Object.freeze({ order: unexpectedNativeDispatchRead }),
  classPropertyStorage: Object.freeze({ get: unexpectedNativeDispatchRead }),
});

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

const noAuthoredNativeMethod = Object.freeze({
  memberSubjectFor: () => assert.fail("an abstract protocol has no authored native slot"),
  memberWritesFor: () => assert.fail("an abstract protocol has no authored native writes"),
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

export { unexpectedNativeDispatchRead, emptyNativeDispatch, integer, noAuthoredNativeMethod, defaultEvidenceFixture, structuralInterfaceRecords, sourceContract, fixture, nativeBoundBase, nativeBoundDerived, genericBoundFixture, programs, nativeModes, adaptedNativeForwarder, nativeProofSource, buildNativeProof, buildNativeProject, genericCases, genericSource };
