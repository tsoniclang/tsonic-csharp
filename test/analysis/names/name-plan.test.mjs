import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpSourceNameBuilder } from "../../../dist/analysis/names/source-names.js";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { createCsharpSyntheticNames } from "../../../dist/backend/planner/names/synthetic.js";

function checkedNames(sourceText) {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": sourceText },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.ok(file);
  const builder = createCsharpSourceNameBuilder({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles: [file],
    sourceIdentities: { node: () => undefined },
  });
  const identifiers = [];
  const visit = node => {
    if (source.ast.is.IsIdentifier(node)) identifiers.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return { source, builder, identifiers };
}

test("the sealed C# name plan is a frozen pure lookup with no allocation port", () => {
  const { builder, identifiers } = checkedNames(`
    export function makeValue(inputValue: number): number {
      const fooBar = inputValue;
      const event = fooBar + 1;
      return event;
    }
  `);
  const before = identifiers.map(node => builder.resolve(node));
  assert.equal(builder.temporaryName("fooBar"), "_fooBar");
  assert.equal(builder.temporaryName("capture0"), "capture0");
  const plan = builder.seal();
  assert.equal(builder.seal(), plan);
  assert.ok(Object.isFrozen(plan));
  assert.deepEqual(Object.keys(plan).sort(), ["reservedNames", "resolve"]);
  assert.equal("temporaryName" in plan, false);
  assert.ok(Object.isFrozen(plan.reservedNames));
  for (const name of ["makeValue", "inputValue", "fooBar", "_fooBar", "capture0", "@event"]) {
    assert.ok(plan.reservedNames.includes(name), name);
  }
  assert.deepEqual(identifiers.map(node => plan.resolve(node)), before);
  for (const node of identifiers) assert.equal(plan.resolve(node), plan.resolve(node));
  assert.deepEqual(plan.resolve(undefined), { kind: "rejected", reason: "The source declaration has no name node." });
  assert.throws(() => builder.temporaryName("late"), /sealed/u);
  assert.equal(plan.reservedNames.includes("late"), false);
});

test("backend synthetic names start from the final reserved inventory and never change the plan", () => {
  const { builder } = checkedNames("export const moduleValue = 1; export function helperValue(): number { return moduleValue; }");
  builder.temporaryName("environment");
  const plan = builder.seal();
  const reserved = [...plan.reservedNames];
  const first = createCsharpSyntheticNames(plan.reservedNames);
  const allocated = ["moduleValue", "environment", "helperValue", "helperValue", "__tsonic_value"].map(name => first.temporaryName(name));
  assert.deepEqual(allocated, ["_moduleValue", "_environment", "_helperValue", "__helperValue", "__tsonic_value"]);
  for (const name of allocated) assert.equal(reserved.includes(name), false, name);
  assert.deepEqual([...plan.reservedNames], reserved);
  const second = createCsharpSyntheticNames(plan.reservedNames);
  assert.deepEqual(["moduleValue", "environment", "helperValue", "helperValue", "__tsonic_value"].map(name => second.temporaryName(name)), allocated);
});

test("a published C# program carries the sealed plan and planning composes its own allocator", () => {
  const checked = checkCsharpSource({ sourceText: `
    export function make(value: number): number {
      class Local { read(): number { return value; } }
      return new Local().read();
    }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  const program = analysis.value;
  assert.ok(Object.isFrozen(program.names));
  assert.deepEqual(Object.keys(program.names).sort(), ["reservedNames", "resolve"]);
  assert.equal("temporaryName" in program.names, false);
  assert.ok(program.classFactories.length > 0);
  for (const factory of program.classFactories) {
    assert.ok(program.names.reservedNames.includes(factory.environmentName), factory.environmentName);
    for (const capture of factory.captures) assert.ok(program.names.reservedNames.includes(capture.fieldName), capture.fieldName);
  }
  const reserved = [...program.names.reservedNames];
  const context = createCsharpPlanningContext(program);
  assert.equal(context.names.resolve, program.names.resolve);
  const generated = context.names.temporaryName(program.classFactories[0].environmentName);
  assert.equal(reserved.includes(generated), false);
  assert.deepEqual([...program.names.reservedNames], reserved);
  assert.equal(createCsharpPlanningContext(program).names.temporaryName(program.classFactories[0].environmentName), generated);
});
