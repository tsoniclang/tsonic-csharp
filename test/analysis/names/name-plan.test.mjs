import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
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
  const nodes = [];
  const bindingRoots = [];
  const visit = node => {
    nodes.push(node);
    if (source.ast.is.IsIdentifier(node)) identifiers.push(node);
    if (source.ast.is.IsParameterDeclaration(node) || source.ast.is.IsVariableDeclaration(node) ||
      source.ast.is.IsForOfStatement(node) || source.ast.is.IsForInStatement(node) ||
      source.ast.is.IsFunctionDeclaration(node)) bindingRoots.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return { source, builder, identifiers, nodes, bindingRoots: Object.freeze(bindingRoots) };
}

test("the sealed C# name plan is a frozen pure lookup with no allocation port", () => {
  const { builder, identifiers, bindingRoots } = checkedNames(`
    export function makeValue(inputValue: number): number {
      const fooBar = inputValue;
      const event = fooBar + 1;
      return event;
    }
  `);
  const before = identifiers.map(node => builder.resolve(node));
  assert.equal(builder.temporaryName("fooBar"), "_fooBar");
  assert.equal(builder.temporaryName("capture0"), "capture0");
  const plan = builder.seal(bindingRoots);
  assert.equal(builder.seal(bindingRoots), plan);
  assert.ok(Object.isFrozen(plan));
  assert.deepEqual(Object.keys(plan).sort(), ["generatedMethodTypeParameters", "issues", "reservedNames", "resolve", "typeParameterNames"]);
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

for (const surface of ["native", "js"]) {
  test(`native nested shadowing is selected once before seal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      type Handler = ($value: number) => number;
      export function run(value: number): number {
        let result = value;
        { const value = 2; result += value; }
        return result;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program.names.issues.length, 0, "unused signature parameters never enter native name validation");
    const ast = program.source.ast;
    let declaration;
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "value") declaration = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.sourceFiles.forEach(visit);
    const selected = program.names.resolve(ast.name(declaration));
    assert.equal(selected.kind === "resolved" && selected.name === "value_1", true,
      "the native CS0136 shadowing constraint is solved by the sole pre-seal name owner");
    for (const reference of program.sourceNavigation.referencesToDeclaration(declaration)) {
      if (ast.is.IsIdentifier(reference)) assert.equal(program.names.resolve(reference) === selected, true,
        "every bound reference consumes the identical selected native name");
    }
    executeCsharpConstruction(compiled, `native-shadow-name-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run(7) != 9) throw new System.Exception("native shadowing name plan");
`);
  });
}

test("backend synthetic names start from the final reserved inventory and never change the plan", () => {
  const { builder, bindingRoots } = checkedNames("export const moduleValue = 1; export function helperValue(): number { return moduleValue; }");
  builder.temporaryName("environment");
  const plan = builder.seal(bindingRoots);
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
  assert.deepEqual(Object.keys(program.names).sort(), ["generatedMethodTypeParameters", "issues", "reservedNames", "resolve", "typeParameterNames"]);
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
  const { source, builder, identifiers, bindingRoots } = checkedNames(`
    class Base {}
    export class Example {
      read<T extends Base, TValue extends T>(T: T, value: TValue): T { const alias: T = value; return T; }
      stable<U>(value: U): U { return value; }
    }
  `);
  const plan = builder.seal(bindingRoots);
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
  const plan = collision.builder.seal(collision.bindingRoots);
  assert.equal(plan.typeParameterNames.length === 1 && plan.typeParameterNames[0].name === "T2", true,
    "the first deterministic free suffix cannot capture the authored T1 binder");
  const stable = checkedNames("interface Stable { read<T>(value: T): T; }");
  const names = stable.builder.seal(stable.bindingRoots);
  assert.equal(names.typeParameterNames.length === 0, true, "no conflict means no native rename");
  for (const identifier of stable.identifiers) assert.equal(names.resolve(identifier).kind === "resolved" &&
    names.resolve(identifier).name === stable.source.ast.text(identifier), true,
  "every original authored spelling is retained when C# has no value-name collision");
});

test("native type-parameter suffixes reserve nested binders, retained locals and prior helper names", () => {
  const fixture = checkedNames(`
    export function outer<T>(T: T): T {
      function inner<T1>(other: T1, value: T): T { return value; }
      const T2 = 1;
      return inner<boolean>(T2 === 1, T);
    }
  `);
  assert.equal(fixture.builder.temporaryName("T3"), "T3", "analysis already allocated this helper before publication");
  const plan = fixture.builder.seal(fixture.bindingRoots);
  assert.equal(plan.typeParameterNames.length === 1 && plan.typeParameterNames[0].name === "T4", true,
    "the selected suffix cannot capture nested T1, retained local T2 or the already allocated T3 helper");
  const outer = fixture.nodes.find(node => fixture.source.ast.is.IsFunctionDeclaration(node) &&
    fixture.source.ast.text(fixture.source.ast.name(node)) === "outer");
  const declaration = fixture.source.ast.typeParameters(outer)[0];
  const uses = [fixture.source.ast.name(declaration), ...fixture.source.navigation.referencesToDeclaration(declaration)];
  assert.equal(uses.length >= 5, true, "the outer binder occurs in its own and the nested signature");
  for (const use of uses) assert.equal(plan.resolve(use).kind === "resolved" && plan.resolve(use).name === "T4", true,
    "every outer bound use keeps its identity across the nested T1 scope");
  for (const identifier of fixture.identifiers.filter(node => ["T1", "T2"].includes(fixture.source.ast.text(node)))) {
    assert.equal(plan.resolve(identifier).kind === "resolved" && plan.resolve(identifier).name === fixture.source.ast.text(identifier), true,
      "unrelated authored nested and value names remain unchanged");
  }
});

for (const [label, sourceText] of [
  ["local", "export function f<T>(value: T): T { const T = value; return T; }"],
  ["object destructuring", "export function f<T>(value: T): T { const { saved: T } = { saved: value }; return T; }"],
  ["array destructuring", "export function f<T>(value: T): T { const [T] = [value]; return T; }"],
  ["parameter destructuring", "export function f<T>({ saved: T }: { saved: T }): T { return T; }"],
  ["iteration", "export function f<T>(values: T[], value: T): T { for (const T of values) { return T; } return value; }"],
  ["initializer-less local", "export function f<T>(value: T): T { let T: T | undefined; if (T === undefined) return value; return T; }"],
  ["local function", "export function f<T>(value: T): T { function T(other: T): T { return other; } return T(value); }"],
  ["used catch", "export function f<T>(value: T): T { try { return value; } catch (T) { if (T instanceof Error) return value; throw T; } }"],
]) {
  test(`retained ${label} bindings select a real in-scope type/value collision`, () => {
    const fixture = checkedNames(sourceText);
    const roots = fixture.bindingRoots.filter(node => {
      const parent = fixture.source.ast.parent(node);
      const owner = parent === undefined ? undefined : fixture.source.ast.parent(parent);
      return owner === undefined || !fixture.source.ast.is.IsForOfStatement(owner);
    });
    const plan = fixture.builder.seal(roots);
    assert.equal(plan.typeParameterNames.length === 1 && plan.typeParameterNames[0].name === "T1", true,
      `${label}: a retained binding, not merely formal parameter spelling, conflicts with the native method binder`);
    for (const identifier of fixture.identifiers.filter(node => fixture.source.ast.text(node) === "T")) {
      const parent = fixture.source.ast.parent(identifier);
      const declaration = parent !== undefined && fixture.source.ast.is.IsTypeParameterDeclaration(parent) ? parent
        : fixture.source.navigation.sourceReferenceFor(identifier)?.declaration;
      const isType = declaration !== undefined && fixture.source.ast.is.IsTypeParameterDeclaration(declaration);
      assert.equal(plan.resolve(identifier).kind === "resolved" && plan.resolve(identifier).name === (isType ? "T1" : "T"), true,
        `${label}: each checked type reference is renamed and each distinct value binding keeps T`);
    }
  });
}

test("actual native binding roots exclude structural arg0 headers and erased optional signatures", () => {
  for (const sourceText of [
    "type Reader = { read<T>(T: T): T };",
    "interface Optional { read?<T>(T: T): T; }",
  ]) {
    const fixture = checkedNames(sourceText);
    const plan = fixture.builder.seal([]);
    assert.equal(plan.typeParameterNames.length, 0, "a source-only T spelling is not an emitted native value parameter");
    for (const identifier of fixture.identifiers) assert.equal(plan.resolve(identifier).kind === "resolved" &&
      plan.resolve(identifier).name === fixture.source.ast.text(identifier), true,
    "unadmitted protocol and optional-header bindings cannot cause an authored type-parameter rename");
  }
  const named = checkedNames("interface NamedGeneric { read<T>(T: T): T; }");
  const plan = named.builder.seal(named.bindingRoots);
  assert.equal(plan.typeParameterNames.length === 1 && plan.typeParameterNames[0].name === "T1", true,
    "the real named native interface emits T and requires the exact approved collision repair");
  const unrelated = checkedNames("export function f<T>(value: T): T { return value; } export const T = 1;");
  assert.equal(unrelated.builder.seal(unrelated.bindingRoots).typeParameterNames.length, 0,
    "a retained same-spelling value outside the binder's lexical scope does not authorize a rename");
});

test("unretained catch and local bindings cannot rename an otherwise nonconflicting native binder", () => {
  for (const sourceText of [
    "export function f<T>(value: T): T { try { return value; } catch (T) { throw T; } }",
    "export function f<T>(value: T): T { try { return value; } catch (T) { return value; } }",
    "export function f<T>(value: T): T { function hidden<U>(T: U): U { return T; } return value; }",
  ]) {
    const fixture = checkedNames(sourceText);
    const retained = fixture.nodes.find(node => fixture.source.ast.is.IsFunctionDeclaration(node) &&
      fixture.source.ast.text(fixture.source.ast.name(node)) === "f");
    const roots = fixture.source.ast.parameters(retained).filter(node => node !== undefined);
    assert.equal(fixture.builder.seal(roots).typeParameterNames.length, 0,
      "only the actual admitted value binding roots may trigger the existing conflict-only policy");
  }
});

test("name publication requires one original checked binding domain and cannot reopen it", () => {
  const fixture = checkedNames("export function f<T>(T: T): T { return T; }");
  assert.throws(() => fixture.builder.seal(), TypeError, "the retired missing-domain API is not supported");
  const foreign = checkedNames("export const outsideName = 1;");
  assert.throws(() => fixture.builder.seal(foreign.bindingRoots), /outside the checked source name inventory/u,
    "a foreign checked declaration is not an admitted root in this name plan");
  const plan = fixture.builder.seal(fixture.bindingRoots);
  assert.equal(fixture.builder.seal([...fixture.bindingRoots]), plan, "the same exact domain is a pure idempotent read");
  assert.throws(() => fixture.builder.seal([]), /different native binding domain/u,
    "publication cannot be repeated with newly invented erasure facts");
  assert.throws(() => fixture.builder.seal(), TypeError, "sealing once does not restore the removed optional-domain API");
});

const bindingSafeNativeSource = `
type Reader = { read<T>(T: T): T };
interface NamedGeneric { read<T>(T: T): T; }
interface Optional { read?<T>(T: T): T; }
class ReaderBody {
  read<Native>(value: Native): Native { return value; }
}
export function outer<T>(T: T): T {
  function inner<T1>(other: T1, value: T): T { return value; }
  return inner<boolean>(true, T);
}
export function local<T>(value: T): T { const T = value; return T; }
export function destructured<T>({ saved: T }: { saved: T }): T { return T; }
export function localSuffix<T>(T: T): T { const T1 = 1; if (T1 === 1) return T; return T; }
export function uninitialized<T>(value: T): T { let T: T | undefined; if (T === undefined) return value; return T; }
export function localFunction<T>(value: T): T { function T(other: T): T { return other; } return T(value); }
export function catchUse<T>(value: T): T {
  try { throw new Error("value"); }
  catch (T) { if (T instanceof Error) return value; throw T; }
}
export function rethrowOnly<T>(value: T): T { try { return value; } catch (T) { throw T; } }
export function unusedCatch<T>(value: T): T { try { return value; } catch (T) { return value; } }
export function dormant<T>(value: T): T { function hidden<U>(T: U): U { return T; } return value; }
export function stable<U>(value: U): U { return value; }
export function readNamed(): number {
  const value: NamedGeneric = new ReaderBody(); return value.read<number>(17);
}
export function readStructural(): number {
  const value: Reader = new ReaderBody(); return value.read<number>(19);
}
export function run(): boolean {
  return outer<number>(7) === 7 && local<number>(11) === 11 &&
    destructured<number>({ saved: 13 }) === 13 && localSuffix<number>(23) === 23 &&
    stable<number>(29) === 29 && readNamed() === 17 && readStructural() === 19 &&
    uninitialized<number>(31) === 31 && localFunction<number>(37) === 37 && catchUse<number>(41) === 41 &&
    rethrowOnly<number>(43) === 43 && unusedCatch<number>(47) === 47 && dormant<number>(53) === 53;
}
`;

for (const surface of ["native", "js"]) {
  test(`${surface}: capture-free pre-seal names preserve nested, local, named and structural native semantics`, () => {
    const compiled = compileCsharpSource({ sourceText: bindingSafeNativeSource, surface });
    assertCsharpCompilationSucceeded(compiled);
    const source = createTargetSourceProgram(compiled.source);
    const file = compiled.source.getSourceFile("/project/index.ts");
    const names = compiled.result.program.names;
    const methods = [];
    const visit = node => {
      if (source.ast.is.IsFunctionDeclaration(node) || source.ast.is.IsMethodSignatureDeclaration(node)) methods.push(node);
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    const unchanged = new Set(["stable", "rethrowOnly", "unusedCatch", "dormant"]);
    for (const ownerName of ["outer", "local", "destructured", "localSuffix", "uninitialized", "localFunction", "catchUse", ...unchanged]) {
      const owner = methods.find(node => source.ast.text(source.ast.name(node)) === ownerName);
      assert.equal(owner !== undefined, true, `${ownerName}: the real checked callable is present`);
      const declaration = source.ast.typeParameters(owner)[0];
      const parameter = csharpSourceTypeParameter(declaration, source.ast);
      assert.equal(parameter !== undefined, true, `${ownerName}: the original checked binder identity is available`);
      const rename = names.typeParameterNames.find(selected => selected.identity === parameter.identity);
      const expected = unchanged.has(ownerName) ? parameter.name : rename?.name;
      assert.equal(unchanged.has(ownerName) ? rename === undefined : expected !== undefined && expected !== "T" && expected !== "T1", true,
        `${ownerName}: the approved conflict-only suffix cannot capture the authored nested or local T1`);
      for (const node of [source.ast.name(declaration), ...source.navigation.referencesToDeclaration(declaration)]) {
        assert.equal(names.resolve(node).kind === "resolved" && names.resolve(node).name === expected, true,
          `${ownerName}: all checked bound uses consume the same capture-free decision`);
      }
    }
    for (const method of methods.filter(node => source.ast.is.IsMethodSignatureDeclaration(node))) {
      const owner = source.ast.parent(method);
      const sourceName = source.ast.name(owner);
      const declaration = source.ast.typeParameters(method)[0];
      const selected = names.resolve(source.ast.name(declaration));
      const named = sourceName !== undefined && source.ast.text(sourceName) === "NamedGeneric";
      const parameter = csharpSourceTypeParameter(declaration, source.ast);
      assert.equal(parameter !== undefined, true, "the original checked method binder identity is available");
      const rename = names.typeParameterNames.find(candidate => candidate.identity === parameter.identity);
      assert.equal(selected.kind === "resolved" && (named
        ? rename !== undefined && selected.name === rename.name && selected.name !== "T" && selected.name !== "T1"
        : rename === undefined && selected.name === "T"), true,
        "only the actual named interface header conflicts; structural arg0 and erased optional headers preserve authored T");
    }
    executeCsharpConstruction(compiled, `binding-safe-type-parameter-${surface}`);
  });
}
