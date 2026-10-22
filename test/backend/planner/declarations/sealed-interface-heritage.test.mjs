import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { planClassHeritage, planInterfaceHeritage } from "../../../../dist/backend/planner/declarations/classes/heritage.js";
import { renderCsharpStructuralInterfaceMembers } from "../../../../dist/backend/planner/objects/declarations/structural-interfaces.js";
import { analyzeCsharpStructuralObjectEmission } from "../../../../dist/analysis/objects/structural-emission.js";
import { objectShapeArtifactKey } from "../../../../dist/analysis/program/records/object-shape-keys.js";
import { targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/index.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { completeCsharpDeclarationHeritage } from "../../../../dist/analysis/project-types/heritage.js";
import { admitCsharpRawInterfaceDeclarations } from "../../../../dist/analysis/declarations/native-value-declarations.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planInterfaceDeclaration } from "../../../../dist/backend/planner/declarations/interfaces/planning.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";

// The sealed program publishes records only; the checked project files come from the checked source.
function projectFiles(compiled) {
  return compiled.source.sourceFiles.filter(file => file !== undefined && !compiled.source.ast.isDeclarationFile(file));
}

// Object-shape views over the published node and carrier shape records.
function shapeViews(program) {
  return { resolveNode: (node, file) => program.records.nodeObjectShape.get(node, file),
    resolveTarget: carrier => program.records.targetObjectShape.get(carrier) };
}

function type(argument, id = "Native.View") {
  return { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id, name: "View", typeArguments: [argument], csharpRender: { kind: "named", name: "View" } };
}

test("classes and interfaces consume one deduplicated exact sealed heritage contract", () => {
  const first = { kind: "type-parameter", name: "Value", identity: "first" };
  const second = { kind: "type-parameter", name: "Value", identity: "second" };
  const authored = type(first);
  const repeated = { ...authored };
  const closed = type({ kind: "source-primitive", name: "int64" });
  const shape = { implements: [repeated, type(second), closed] };
  const heritage = completeCsharpDeclarationHeritage({ interfaces: [authored] }, shape);
  const input = { scope: { typeParameterNames: new Map([["first", "First"], ["second", "Second"]]) },
    program: { records: { declarationHeritage: { get: () => heritage } } } };
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    const diagnostics = [];
    const result = owner({}, input, diagnostics);
    const interfaces = Array.isArray(result) ? result : result.interfaces;
    assert.deepEqual(interfaces.map(contract => contract.typeArguments[0]), [
      { kind: "IdentifierName", name: "First" }, { kind: "IdentifierName", name: "Second" }, { kind: "PredefinedType", name: "long" },
    ], "exact generic identities and native carriers survive structural inheritance");
    assert.equal(diagnostics.length, 0, "no guessed or duplicate native heritage");
  }
});

test("heritage rejects unavailable owner and unrenderable sealed contracts", () => {
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    const diagnostics = [];
    assert.throws(() => owner({}, {
      scope: {}, program: { records: { declarationHeritage: { get: () => undefined } } },
    }, diagnostics), error => error.message.includes("admitted canonical C# project-type model"),
    "an absent admitted owner never emits an alternative native contract");
    assert.equal(diagnostics.length, 0, "absent internal evidence is not a source rejection");
    assert.throws(() => owner({}, {
      scope: {}, program: { records: { declarationHeritage: { get: () => ({
        interfaces: [{ kind: "opaque", id: "missing" }],
      }) } } },
    }, diagnostics), error => error.message.includes("Admitted native declaration heritage lost its exact type rendering."),
    "a forged admitted carrier violates the declaration admission guarantee");
    assert.equal(diagnostics.length, 0, "only declaration admission owns the source refusal");
  }
});

for (const preview of [false, true]) {
  test(`inherited interface hiding is sealed before actual ${preview ? "preview unsafe" : "ordinary"} constructors`, () => {
    const compiled = compileCsharpSource({ sourceText: `
      ${preview ? 'import { safety } from "@tsonic/core/lang.js";' : ""}
      export interface Base { value: number; invoke(): void; }
      export interface Derived extends Base {
        value: number;
        invoke(): void;
        readonly independent: number;
        readonly [key: number]: number;
      }
      ${preview ? "safety<Base>().method(value => value.invoke).requiresunsafe(); safety<Derived>().method(value => value.invoke).requiresunsafe();" : ""}
    `, ...(preview ? { targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } } : {}) });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const declarations = projectFiles(compiled).flatMap(file => ast.statements(file))
      .filter(node => node !== undefined && ast.is.IsInterfaceDeclaration(node));
    const base = declarations.find(node => ast.text(ast.name(node)) === "Base");
    const derived = declarations.find(node => ast.text(ast.name(node)) === "Derived");
    assert.equal(base !== undefined && derived !== undefined, true, "both real checked interface declarations are retained");
    const sourceMembers = ast.members(derived).filter(node => node !== undefined);
    const rows = () => sourceMembers.map(declaration => ({
      subject: { kind: "source", declaration, role: "member" },
      hides: program.records.nativeMemberHiding.get({ kind: "source", declaration, role: "member" }),
    }));
    const facts = () => [base, derived, ...ast.members(base), ...sourceMembers].filter(node => node !== undefined).map(node => ({
      declaration: node,
      name: { ...program.records.sourceName.get(ast.name(node)) },
      participation: program.records.nativeParticipation.get(node),
      safety: program.records.safetyApplication.get(node).map(application => ({ ...application })),
    }));
    const before = { memberHiding: rows(), declarationFacts: facts() };
    assert.deepEqual(before.memberHiding.map(row => row.hides), [true, true, false, undefined],
      "only inherited named headers hide; an indexer has no invented hiding row");
    const diagnostics = [];
    const context = createCsharpPlanningContext(program);
    const rendered = planInterfaceDeclaration(derived, ast.getSourceFile(derived), context, diagnostics);
    const baseRendered = planInterfaceDeclaration(base, ast.getSourceFile(base), context, diagnostics);
    assert.deepEqual(rendered.members.map(member => [member.kind, member.name]), [
      ["PropertyDeclaration", "value"], ["MethodDeclaration", "invoke"],
      ["PropertyDeclaration", "independent"], ["IndexerDeclaration", undefined],
    ], "all original named members and the indexer retain exact membership and order");
    assert.deepEqual(rendered.members[0].modifiers, ["new"], "the ordinary property constructor reads the true row");
    assert.deepEqual(rendered.members[1].modifiers, preview ? ["new", "unsafe"] : ["new"],
      "the method constructor places the native hiding modifier before the real safety modifier");
    assert.deepEqual(baseRendered.members[1].modifiers, preview ? ["unsafe"] : [],
      "both sides have the same explicit safety contract, not a safety mismatch");
    const number = { kind: "PredefinedType", name: "double" };
    assert.equal(isDeepStrictEqual(rendered.members[2], { kind: "PropertyDeclaration", name: "independent",
      modifiers: [], getterModifiers: [], setterModifiers: [], attributes: undefined, writable: false, type: number }), true,
    "the unrelated property retains every constructor field");
    assert.equal(isDeepStrictEqual(rendered.members[3], { kind: "IndexerDeclaration", modifiers: [],
      getterModifiers: [], setterModifiers: [], attributes: undefined, writable: false, keyName: "key", keyType: number, valueType: number }), true,
    "the unrelated indexer retains every constructor field");
    assert.equal(isDeepStrictEqual({ memberHiding: rows(), declarationFacts: facts() }, before), true,
      "all exact owner rows and complete consumed checked declaration facts remain unchanged across planning");
    if (preview) {
      const printed = printCsharpCompilationUnit({ usings: [], members: [rendered] });
      assert.equal(printed.includes("new unsafe void invoke();"), true, "the actual printed member retains new then unsafe");
    }
    assert.equal(diagnostics.length, 0, "hiding constructors do not recreate source diagnostics");
    const value = sourceMembers[0];
    const brokenProgram = { ...program, records: { ...program.records, nativeMemberHiding: { get(subject) {
      return subject.kind === "source" && subject.declaration === value ? undefined : program.records.nativeMemberHiding.get(subject);
    } } } };
    assert.throws(() => planInterfaceDeclaration(derived, ast.getSourceFile(derived), createCsharpPlanningContext(brokenProgram), diagnostics),
      /An admitted native member lost its final physical-container hiding decision/u,
      "a separately corrupted admitted row uses only the common planner invariant");
    assert.equal(diagnostics.length, 0, "the corruption witness never substitutes a new source refusal");
  });
}

test("generated method-value handles reuse only the identical available inherited storage", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const member = { memberKind: "method", sourceName: "read", targetName: "read",
    sourceKey: { kind: "property", name: "read" }, type: csharpDelegateTargetType("System.Func", [integer]) };
  const shape = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Reader", csharpStructuralContract: true },
    members: [member] };
  const storage = { nativeField: { get: () => undefined } };
  const inherited = [{ shape, methodValues: true }];
  // The child structural contract implements each parent; the artifact demand grants method values to the child and to
  // each parent whose fixture says so. The analysis decides handle reuse; the renderer only prints its records.
  const render = (parents, names) => {
    const facts = parents.map((parent, index) => ({ ...parent.shape,
      targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: `ReaderBase${index}` } }));
    const child = { ...shape, implements: facts.map(fact => fact.targetType) };
    const byKey = new Map([child, ...facts].map(fact => [targetTypeRefKey(fact.targetType), fact]));
    const capabilities = new Map([[objectShapeArtifactKey(child), ["method-values"]],
      ...facts.flatMap((fact, index) => parents[index].methodValues ? [[objectShapeArtifactKey(fact), ["method-values"]]] : [])]);
    const emission = analyzeCsharpStructuralObjectEmission({
      shapes: { knownShapes: () => [child, ...facts], resolveTarget: carrier => byKey.get(targetTypeRefKey(carrier)) },
      demand: { artifacts: [], get: key => capabilities.has(key) ? { capabilities: capabilities.get(key) } : undefined }, storage });
    assert.equal(emission.issues.length, 0, "every fixture member has native type syntax");
    return renderCsharpStructuralInterfaceMembers(undefined, child, { ...emission.records, nativeMemberHiding: names.memberHiding });
  };
  const namesFor = (methodHides, storageHides) => ({ memberHiding: { get(subject) {
    assert.equal(subject.kind, "artifact", "the renderer consumes an admitted artifact member");
    assert.equal(subject.container, objectShapeArtifactKey(shape), "the typed handle fixture retains its exact container");
    assert.equal(subject.role, "member", "the typed handle fixture reads only final hiding");
    assert.equal(subject.member === "read" || subject.member === "__tsonic_shape_method_0_read", true,
      "no unlisted header can acquire a blanket false hiding result");
    return subject.member === "read" ? methodHides : storageHides;
  } } });
  const rendered = render(inherited, namesFor(true, true));
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].kind, "MethodDeclaration");
  assert.deepEqual(rendered[0].modifiers, ["new"]);
  for (const { parent, names } of [
    { parent: { shape, methodValues: false }, names: namesFor(true, false) },
    { parent: { shape: { members: [{ ...member, optional: true }] }, methodValues: true }, names: namesFor(false, true) },
    { parent: { shape: { members: [{ ...member, type: csharpDelegateTargetType("System.Func",
      [{ kind: "source-primitive", name: "uint32" }]) }] }, methodValues: true }, names: namesFor(true, true) },
    { parent: { shape: { members: [{ ...member, targetName: "other" }] }, methodValues: true }, names: namesFor(false, false) },
  ]) {
    const members = render([parent], names);
    assert.equal(members.some(candidate => candidate.kind === "PropertyDeclaration"), true,
      "capability, absence, signedness and exact native storage name remain independent gates");
  }
});

test("completed raw-interface admission owns exact member rendering refusals", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export interface View { read(value: number): number; }
    export function use(value: View): number { return value.read(7); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const ast = program.source.ast;
  const declaration = projectFiles(compiled).flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsInterfaceDeclaration(node));
  assert.equal(declaration !== undefined, true, "the checked raw-interface declaration is retained");
  const file = ast.getSourceFile(declaration);
  const shapes = shapeViews(program);
  const shape = shapes.resolveNode(declaration, file);
  const opaque = Object.freeze({ kind: "opaque", id: "missing" });
  const artifacts = { get: () => ({ capabilities: ["method-values"] }) };
  const original = admitCsharpRawInterfaceDeclarations(ast, [declaration], { order: () => [] }, shapes,
    artifacts, program.records, program.records.compileTimeMetadata, program.records.nativeParticipation,
    program.records.nativeUnreachable);
  assert.equal(original.length, 0, "a completed valid native shape is not rejected");
  for (const control of [
    { label: "method signature", shape: { ...shape, members: [{ ...shape.members[0], type: opaque }] },
      inherited: false, message: "An interface method value requires its exact native callable storage contract." },
    { label: "inherited signature", shape, inherited: true,
      message: "An inherited interface requires exact native member signatures." },
  ]) {
    const invalid = control.inherited ? { ...shape, implements: [opaque] } : control.shape;
    const views = { resolveNode: () => invalid, resolveTarget: type => type === opaque
      ? { ...shape, members: [{ ...shape.members[0], type: opaque }] } : shapes.resolveTarget(type) };
    const issues = admitCsharpRawInterfaceDeclarations(ast, [declaration], { order: () => [] }, views, artifacts,
      program.records, program.records.compileTimeMetadata, program.records.nativeParticipation,
      program.records.nativeUnreachable);
    assert.equal(issues.length, 1, `${control.label}: exactly one admission refusal`);
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", `${control.label}: unchanged diagnostic code`);
    assert.equal(issues[0].message, control.message, `${control.label}: unchanged diagnostic reason`);
    assert.equal(issues[0].sourceNode === declaration, true, `${control.label}: unchanged exact declaration identity`);
  }
  const input = createCsharpPlanningContext(program);
  // Corrupt the sealed records the planner consumes: force the method-value capability and give the published
  // method-value handle an opaque carrier. The planner must fail its invariant instead of re-deriving or refusing.
  const records = input.program.records;
  const corrupted = { ...input, program: { ...input.program, records: { ...records,
    objectShapeArtifact: { get: key => { const artifact = records.objectShapeArtifact.get(key);
      return artifact === undefined ? undefined : { ...artifact, capabilities: [...new Set([...artifact.capabilities, "method-values"])] }; } },
    structuralObject: { get: fact => { const selected = records.structuralObject.get(fact);
      return selected === undefined ? undefined : { ...selected,
        methodValues: [{ name: "__tsonic_shape_method_0_read", type: opaque, writable: false }] }; } } } } };
  const diagnostics = [];
  assert.throws(() => planInterfaceDeclaration(declaration, file, corrupted, diagnostics),
    error => error.message.includes("requires its renderable carrier"), "a separate corruption witness pins the planner guarantee");
  assert.equal(diagnostics.length, 0, "corruption does not duplicate a source renderability rule in the planner");
});
