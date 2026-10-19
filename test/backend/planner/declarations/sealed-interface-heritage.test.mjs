import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { planClassHeritage, planInterfaceHeritage } from "../../../../dist/backend/planner/declarations/classes/heritage.js";
import { renderCsharpStructuralInterfaceMembers } from "../../../../dist/backend/planner/objects/declarations/structural-interfaces.js";
import { objectShapeArtifactKey } from "../../../../dist/target-model/records/object-shape-demand.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/index.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { completeCsharpDeclarationHeritage } from "../../../../dist/analysis/project-types/heritage.js";
import { admitCsharpRawInterfaceDeclarations } from "../../../../dist/analysis/declarations/native-value-declarations.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planInterfaceDeclaration } from "../../../../dist/backend/planner/declarations/interfaces/planning.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";

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
    types: { projectTypes: { heritageForDeclaration: () => heritage } } };
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
      scope: {}, types: { projectTypes: { heritageForDeclaration: () => undefined } },
    }, diagnostics), error => error.message.includes("admitted canonical C# project-type model"),
    "an absent admitted owner never emits an alternative native contract");
    assert.equal(diagnostics.length, 0, "absent internal evidence is not a source rejection");
    assert.throws(() => owner({}, {
      scope: {}, types: { projectTypes: { heritageForDeclaration: () => ({
        interfaces: [{ kind: "opaque", id: "missing" }],
      }) } },
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
    const declarations = program.sourceFiles.flatMap(file => ast.statements(file))
      .filter(node => node !== undefined && ast.is.IsInterfaceDeclaration(node));
    const base = declarations.find(node => ast.text(ast.name(node)) === "Base");
    const derived = declarations.find(node => ast.text(ast.name(node)) === "Derived");
    assert.equal(base !== undefined && derived !== undefined, true, "both real checked interface declarations are retained");
    const sourceMembers = ast.members(derived).filter(node => node !== undefined);
    const rows = () => sourceMembers.map(declaration => ({
      subject: { kind: "source", declaration, role: "member" },
      hides: program.names.memberHiding.get({ kind: "source", declaration, role: "member" }),
    }));
    const facts = () => [base, derived, ...ast.members(base), ...sourceMembers].filter(node => node !== undefined).map(node => ({
      declaration: node,
      name: { ...program.names.resolve(ast.name(node)) },
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
    const brokenProgram = { ...program, names: { ...program.names, memberHiding: { get(subject) {
      return subject.kind === "source" && subject.declaration === value ? undefined : program.names.memberHiding.get(subject);
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
  const shape = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Reader" }, members: [member] };
  const storage = { nativeField: { get: () => undefined } };
  const inherited = [{ shape, methodValues: true }];
  const namesFor = (methodHides, storageHides) => ({ memberHiding: { get(subject) {
    assert.equal(subject.kind, "artifact", "the renderer consumes an admitted artifact member");
    assert.equal(subject.container, objectShapeArtifactKey(shape), "the typed handle fixture retains its exact container");
    assert.equal(subject.role, "member", "the typed handle fixture reads only final hiding");
    assert.equal(subject.member === "read" || subject.member === "__tsonic_shape_method_0_read", true,
      "no unlisted header can acquire a blanket false hiding result");
    return subject.member === "read" ? methodHides : storageHides;
  } } });
  const rendered = renderCsharpStructuralInterfaceMembers(undefined, shape, storage, true, inherited, namesFor(true, true));
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
    const members = renderCsharpStructuralInterfaceMembers(undefined, shape, storage, true, [parent], names);
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
  const declaration = program.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsInterfaceDeclaration(node));
  assert.equal(declaration !== undefined, true, "the checked raw-interface declaration is retained");
  const file = ast.getSourceFile(declaration);
  const shape = program.objectShapes.resolveNode(declaration, file);
  const opaque = Object.freeze({ kind: "opaque", id: "missing" });
  const artifacts = { get: () => ({ capabilities: ["method-values"] }) };
  const original = admitCsharpRawInterfaceDeclarations(ast, [declaration], { order: () => [] }, program.objectShapes,
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
      ? { ...shape, members: [{ ...shape.members[0], type: opaque }] } : program.objectShapes.resolveTarget(type) };
    const issues = admitCsharpRawInterfaceDeclarations(ast, [declaration], { order: () => [] }, views, artifacts,
      program.records, program.records.compileTimeMetadata, program.records.nativeParticipation,
      program.records.nativeUnreachable);
    assert.equal(issues.length, 1, `${control.label}: exactly one admission refusal`);
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", `${control.label}: unchanged diagnostic code`);
    assert.equal(issues[0].message, control.message, `${control.label}: unchanged diagnostic reason`);
    assert.equal(issues[0].sourceNode === declaration, true, `${control.label}: unchanged exact declaration identity`);
  }
  const input = createCsharpPlanningContext(program);
  const corrupted = { ...input, types: { ...input.types, objectShapes: { ...input.types.objectShapes,
    resolveNode: () => ({ ...shape, members: [{ ...shape.members[0], type: opaque }] }) } },
    artifacts: { ...input.artifacts, objectShapeHasCapability: () => true } };
  const diagnostics = [];
  assert.throws(() => planInterfaceDeclaration(declaration, file, corrupted, diagnostics),
    error => error.message.includes("native callable storage"), "a separate corruption witness pins the planner guarantee");
  assert.equal(diagnostics.length, 0, "corruption does not duplicate a source renderability rule in the planner");
});
