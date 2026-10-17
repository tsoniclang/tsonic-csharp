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
import { csharpSourceTypeParameter } from "../../../dist/target-model/names/type-parameters.js";

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
    semanticsFor: source.semantics.forNode,
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
  assert.deepEqual(Object.keys(plan).sort(), ["reservedNames", "resolve", "typeParameterNames"]);
  assert.equal(Object.isFrozen(plan.typeParameterNames) && plan.typeParameterNames.length === 0, true,
    "a source with no type/value conflict has no fabricated binder rename");
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
  assert.deepEqual(Object.keys(program.names).sort(), ["reservedNames", "resolve", "typeParameterNames"]);
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

test("only a type parameter with an actual value-parameter collision is renamed before seal", () => {
  const { source, builder, identifiers } = checkedNames(`
    class Base {}
    export class Example {
      read<T extends Base, TValue extends T>(T: T, value: TValue): T { const alias: T = value; return T; }
      stable<U>(value: U): U { return value; }
    }
  `);
  const plan = builder.seal();
  assert.equal(Object.isFrozen(plan.typeParameterNames) && plan.typeParameterNames.length === 1 &&
    Object.isFrozen(plan.typeParameterNames[0]) && plan.typeParameterNames[0].name === "T1", true,
  "the single binding-safe rename is immutable selected data, not an allocating lookup");
  let typeUses = 0;
  let valueUses = 0;
  let collisionDeclaration;
  for (const identifier of identifiers) {
    const parent = source.ast.parent(identifier);
    const declaration = parent !== undefined && source.ast.is.IsTypeParameterDeclaration(parent) && source.ast.name(parent) === identifier
      ? parent : source.navigation.sourceReferenceFor(identifier)?.declaration;
    const parameter = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, source.ast);
    const spelling = source.ast.text(identifier);
    const selected = plan.resolve(identifier);
    if (parameter?.identity === plan.typeParameterNames[0].identity) {
      collisionDeclaration = declaration;
      typeUses += 1;
      assert.equal(selected.kind === "resolved" && selected.name === "T1", true,
        "the declaration, dependent constraint and every bound type use consume the identical pre-seal decision");
    } else if (spelling === "T") {
      valueUses += 1;
      assert.equal(selected.kind === "resolved" && selected.name === "T", true, "the authored value parameter and its uses keep their spelling");
    } else if (spelling === "U" || spelling === "TValue") {
      assert.equal(selected.kind === "resolved" && selected.name === spelling, true, "nonconflicting authored type parameters are not renamed");
    }
  }
  assert.equal(typeUses >= 5 && valueUses === 2, true, "real bound type uses and the distinct value binding were all observed");
  const foreign = checkedNames("export const outsideName = 1;");
  const outside = foreign.identifiers.find(identifier => foreign.source.ast.text(identifier) === "outsideName");
  assert.equal(collisionDeclaration !== undefined && outside !== undefined && plan.resolve(outside, collisionDeclaration).kind === "rejected", true,
    "a selected binder cannot admit an unrelated checked source node outside the frozen name plan");
});

test("type-parameter suffixes avoid existing native binders and leave conflict-free declarations unchanged", () => {
  const collision = checkedNames("export function read<T, T1>(T: T, other: T1): T { return T; }");
  const plan = collision.builder.seal();
  assert.equal(plan.typeParameterNames.length === 1 && plan.typeParameterNames[0].name === "T2", true,
    "the first deterministic free suffix cannot capture the authored T1 binder");
  const stable = checkedNames("interface Stable { read<T>(value: T): T; }");
  const names = stable.builder.seal();
  assert.equal(names.typeParameterNames.length === 0, true, "no conflict means no native rename");
  for (const identifier of stable.identifiers) assert.equal(names.resolve(identifier).kind === "resolved" &&
    names.resolve(identifier).name === stable.source.ast.text(identifier), true,
  "every original authored spelling is retained when C# has no value-name collision");
});
