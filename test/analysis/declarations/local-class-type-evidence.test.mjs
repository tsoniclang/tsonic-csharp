import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { sealCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { projectTypeDefinition } from "../../../dist/analysis/project-types/type-policy.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/native-value-declarations.js";
import { planClassFactoryExpression } from "../../../dist/backend/planner/declarations/classes/factories.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planStatements } from "../../../dist/backend/planner/statements/planning.js";

test("local class catalogs require exact outer type-parameter evidence", () => {
  // nextgen C-2542: the program goes through the Host; the catalog host is { ast, facts, sourceFiles, sourceFacts } and
  // the class binder vector is the Host publication facts.values.type (no semantics, navigation or effectiveTypes).
  const program = hostProgram(`
      function factory<Outer>(outer: Outer) {
        return class Box<Inner> {
          value: Inner;
          constructor(value: Inner) { this.value = value; }
          read(): Outer { return outer; }
        };
      }
    `);
  const declaration = program.nodes.find(node => program.ast.is.IsClassExpression(node));
  assert.ok(declaration);
  const host = { ast: program.ast, facts: program.facts, sourceFiles: program.files, sourceFacts: program.host.sourceFacts };
  const withType = type => ({ ...host, facts: { ...program.facts, values: { ...program.facts.values, type } } });
  const selected = projectTypeDefinition(host, declaration);
  assert.equal(selected.kind, "resolved");
  const definition = selected.definition;
  assert.equal(definition.outerTypeParameters.length, 1);
  assert.equal(definition.sourceTypeParameterCount, 1);
  assert.deepEqual(definition.typeParameterBindings.map(parameter => parameter.name), ["Outer", "Inner"]);
  assert.equal(new Set(definition.typeParameterBindings.map(parameter => parameter.identity)).size, 2);
  // nextgen C-2542: the old "no publication" (effectiveTypes.get → undefined) is a refused publication now (I4).
  assert.equal(projectTypeDefinition(withType(node => node === declaration
    ? { kind: "refused", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: declaration, message: "fixture" }
    : program.facts.values.type(node)), declaration).kind, "not-project-type");
  const publication = program.facts.values.type(declaration);
  assert.equal(publication !== undefined && publication.kind !== "refused" &&
    (publication.type.kind === "callable" || publication.type.kind === "shape"), true,
  "the original class expression has its canonical constructor publication");
  const own = program.ast.typeParameters(declaration);
  const incomplete = { ...publication, type: { ...publication.type, constructs: publication.type.constructs.map(signature => ({
    ...signature, result: { ...signature.result, typeArguments: signature.result.typeArguments.filter(argument =>
      argument.kind !== "declared" || !own.includes(argument.declaration)) },
  })) } };
  assert.equal(projectTypeDefinition(withType(node => node === declaration ? incomplete
    : program.facts.values.type(node)), declaration).kind, "not-project-type");
});

for (const surface of ["native", "js"]) {
  test(`local factory identity is declaration-owned without captured storage on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      function make() {
        class Item { constructor() {} }
        return { Item, value: new Item() };
      }
      function makeGeneric() {
        class Item<Value> {
          value: Value;
          constructor(value: Value) { this.value = value; }
        }
        return { Item, value: new Item<number>(1) };
      }
      export function run(): boolean {
        const first = make();
        const second = make();
        const genericFirst = makeGeneric();
        const genericSecond = makeGeneric();
        return first.value instanceof first.Item && !(first.value instanceof second.Item) &&
          genericFirst.value instanceof genericFirst.Item && !(genericFirst.value instanceof genericSecond.Item);
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program.classFactories.length, 2, "the two actual local declarations have canonical factory records");
    for (const factory of program.classFactories) {
      assert.equal(factory.captures.length === 0 && factory.hasInstanceCaptures === false, true,
        "factory identity is independent of an invented capture environment");
      assert.equal(Object.hasOwn(factory, "requiresInstanceTest") || Object.hasOwn(factory, "retainsEnvironment"), false,
        "the removed whole-use selectors have no compatibility fields");
      const generic = program.source.syntax.typeParameters(factory.declaration).length !== 0;
      assert.equal((factory.identity !== undefined) === generic, true,
        "the existing generic identity contract comes from its own declared type parameters");
    }
    executeCsharpConstruction(compiled, `declared-factory-identity-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("distinct native factory evaluations retain identity");
`);
  });

  test(`local class native captures and one complete constructor entry remain unchanged on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      function make(seed: number) {
        return class View {
          value: number;
          constructor(value: number) { this.value = value + seed; }
          read(): number { return this.value; }
        };
      }
      export function run(): number { const View = make(4); return new View(3).read(); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const factory = program.classFactories[0];
    assert.equal(factory !== undefined && factory.captures.length === 1, true,
      "the actual completed local factory retains its one checked native capture");
    executeCsharpConstruction(compiled, `native-factory-admission-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 7) throw new System.Exception("native class factory capture and entry");
`);
    const original = program.records;
    const records = { ...original, physicalStorageType: { get: () => ({ kind: "opaque", id: "missing" }) } };
    const nativeUse = { get: records.nativeUse.get, order: records.nativeOrder.get };
    const issues = admitCsharpNativeDeclarations(program.source.syntax, [factory.declaration], nativeUse,
      program.projectTypes, program.source.facts, records, records, records.nativeParticipation, records.nativeUnreachable,
      records, records.callableDispatch, records.classFactory, records);
    assert.equal(issues.length, 1, "an actual non-frame capture's unrenderable physical carrier is refused before sealing");
    assert.equal(issues[0].message, "A class capture has no renderable native storage.", "the original capture refusal is unchanged");
    assert.equal(issues[0].sourceNode === factory.captures[0].declaration, true,
      "the exact captured declaration remains the diagnostic subject");
    const diagnostics = [];
    const captures = original.classCaptures.get(factory.declaration);
    assert.equal(captures.length > 0, true, "the renderer consumes the completed physical capture slots");
    const corrupted = { ...records, classCaptures: { get: node => node === factory.declaration
      ? captures.map(slot => ({ ...slot, carrier: { kind: "opaque", id: "missing" } })) : original.classCaptures.get(node) } };
    const input = createCsharpPlanningContext(sealCsharpAnalysisProgram({ ...program, records: corrupted }));
    assert.throws(() => planClassFactoryExpression(factory, factory.sourceFile, input, diagnostics),
      error => error.message.includes("renderable physical storage"), "a separate corrupted-admission witness pins the renderer");
    assert.equal(diagnostics.length, 0, "the capture renderer cannot re-issue the source refusal");
  });

  test(`unpublished implicit constructor omission variants keep the exact existing factory refusal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Base {
        value: string;
        constructor(value: string, suffix?: string) { this.value = value + (suffix ?? ""); }
      }
      function make() { return class View extends Base {}; }
      export function run(): string { const View = make(); return new View("ready").value; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the omitted constructor argument is valid checked source");
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "the existing unsupported entry list retains its one current refusal");
    // nextgen C-2542: CSHARP_UNSUPPORTED_AST is split; the local class planning owner names CSHARP_LOCAL_CLASS_FACTORY_CONSTRUCTOR.
    assert.equal(issues[0].code, "CSHARP_LOCAL_CLASS_FACTORY_CONSTRUCTOR", "the original source code is preserved");
    assert.equal(issues[0].message, "A local class factory requires one exact planned constructor and its environment parameter.",
      "the exact existing factory refusal does not silently choose one entry");
    assert.equal(compiled.source.ast.is.IsClassExpression(issues[0].sourceNode), true,
      "the refusal remains on the exact local class declaration");
    // analysis/ owns all source admission (tsonic/docs/architecture/csharp-rust-structure.md, analysis/ row): the
    // factory refusal is an analysis refusal, so no program, plan or artifact is published (RULINGS 2026-10-22).
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "C375 is refused in analysis with no program, plan or artifacts until CH11 publishes the exact entry list");
  });
}

test("local class statements consume required admitted factory records", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(): number { class View { value: number = 7; } return new View().value; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const factory = program.classFactories[0];
  assert.equal(factory !== undefined, true, "the actual local-class producer publishes its required record");
  const context = createCsharpPlanningContext(sealCsharpAnalysisProgram(program));
  const diagnostics = [];
  const planned = planStatements(factory.declaration, factory.sourceFile, context, diagnostics);
  assert.equal(planned.length, 1, "a local class has one native environment declaration");
  assert.equal(diagnostics.length, 0, "the admitted local class needs no aggregate source refusal");
  for (const control of [
    { label: "required record", selected: undefined, message: "required native factory" },
    { label: "admitted type", selected: { ...factory, factoryType: { kind: "opaque", id: "corrupted" } },
      message: "renderable native factory type" },
  ]) {
    const corrupted = { ...program, records: { ...program.records,
      classFactory: { get: node => node === factory.declaration ? control.selected : program.records.classFactory.get(node) } } };
    assert.throws(() => planStatements(factory.declaration, factory.sourceFile, { ...context, program: corrupted }, diagnostics),
      error => error.message.includes(control.message), `${control.label}: only corrupted producer evidence reaches the invariant`);
    assert.equal(diagnostics.length, 0, `${control.label}: no duplicate source diagnostic is emitted`);
  }
});
