import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { projectTypeDefinition } from "../../../dist/analysis/project-types/type-policy.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/native-value-declarations.js";
import { planClassFactoryExpression } from "../../../dist/backend/planner/declarations/classes/factories.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planStatements } from "../../../dist/backend/planner/statements/planning.js";

test("local class catalogs require exact outer type-parameter evidence", () => {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": `
      function factory<Outer>(outer: Outer) {
        return class Box<Inner> {
          value: Inner;
          constructor(value: Inner) { this.value = value; }
          read(): Outer { return outer; }
        };
      }
    ` },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  let declaration;
  const visit = node => {
    if (source.ast.is.IsClassExpression(node)) declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  const sourceFile = checked.getSourceFile("/project/index.ts");
  assert.ok(sourceFile);
  visit(sourceFile);
  assert.ok(declaration);
  const semantics = source.semantics.forNode(declaration);
  const host = { ast: source.ast, navigation: source.navigation, enumConstants: source.semantics.enumConstants, semanticsFor: () => semantics };
  const selected = projectTypeDefinition(host, declaration);
  assert.equal(selected.kind, "resolved");
  const definition = selected.definition;
  assert.equal(definition.outerTypeParameters.length, 1);
  assert.equal(definition.sourceTypeParameterCount, 1);
  assert.deepEqual(definition.typeParameterBindings.map(parameter => parameter.name), ["Outer", "Inner"]);
  assert.equal(new Set(definition.typeParameterBindings.map(parameter => parameter.identity)).size, 2);
  assert.equal(projectTypeDefinition({ ...host, semanticsFor: () => ({ ...semantics,
    declarations: { ...semantics.declarations, declaredType: () => undefined },
  }) }, declaration).kind, "not-project-type");
  assert.equal(projectTypeDefinition({ ...host, semanticsFor: () => ({ ...semantics,
    types: { ...semantics.types, typeArgumentBindings: () => undefined },
  }) }, declaration).kind, "not-project-type");
});

for (const surface of ["native", "js"]) {
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
    const issues = admitCsharpNativeDeclarations(program.source.ast, [factory.declaration], nativeUse,
      program.projectTypes, program.sourceNavigation, records, records, records.nativeParticipation, records.nativeUnreachable,
      records, records.callableDispatch, records.classFactory, records);
    assert.equal(issues.length, 1, "an actual non-frame capture's unrenderable physical carrier is refused before sealing");
    assert.equal(issues[0].message, "A class capture has no renderable native storage.", "the original capture refusal is unchanged");
    assert.equal(issues[0].sourceNode === factory.captures[0].declaration, true,
      "the exact captured declaration remains the diagnostic subject");
    const diagnostics = [];
    const input = createCsharpPlanningContext({ ...program, records });
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
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the original source code is preserved");
    assert.equal(issues[0].message, "A local class factory requires one exact planned constructor and its environment parameter.",
      "the exact existing factory refusal does not silently choose one entry");
    const source = createTargetSourceProgram(compiled.source);
    assert.equal(source.ast.is.IsClassExpression(issues[0].sourceNode), true,
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
  const context = createCsharpPlanningContext(program);
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
