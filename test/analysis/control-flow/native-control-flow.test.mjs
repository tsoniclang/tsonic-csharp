import assert from "node:assert/strict";
import test from "node:test";
import { nativeFinallyOverrideSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { admitCsharpStatementBindings } from "../../../dist/analysis/control-flow/native-control-flow.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planPropertyDeclaration } from "../../../dist/backend/planner/declarations/classes/properties.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native C# rejects control transfer leaving cleanup before publishing output in ${surface}`, () => {
    for (const sourceText of [nativeFinallyOverrideSource,
      "export function run(): void { while (true) { try {} finally { break; } } }",
      "export function run(): void { while (true) { try {} finally { continue; } } }"]) {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.equal(compiled.result.diagnostics.some(row => row.code === "CSHARP_NATIVE_FINALLY_CONTROL_TRANSFER"), true,
        "native cleanup transfer prohibition must be diagnosed at analysis");
      assert.equal(compiled.artifacts.size, 0, "invalid native control flow must not publish partial artifacts");
    }
  });
}

test("checked-source admission excludes malformed binding and control-flow grammar before planning", () => {
  for (const control of [
    { label: "uninitialized destructuring", sourceText: "export function run(): void { let { value }: { value: number }; }" },
    { label: "multiple for-of declarations", sourceText: "export function run(): void { for (let first, second of [1]) {} }" },
    { label: "initialized for-of declaration", sourceText: "export function run(): void { for (let value = 1 of [1]) {} }" },
    { label: "missing condition", sourceText: "export function run(): void { if () {} }" },
    { label: "missing setter parameter", sourceText: "export class View { set value() {} }" },
    { label: "multiple setter parameters", sourceText: "export class View { set value(first: number, second: number) {} }" },
    { label: "multiple index signature keys", sourceText: "export interface View { [first: string, second: string]: number; }" },
    { label: "interface property initializer", sourceText: "export interface View { value: number = 1; }" },
  ]) {
    const compiled = compileCsharpSource({ sourceText: control.sourceText });
    assert.equal(compiled.sourceDiagnosticsText.length > 0, true, `${control.label}: checked syntax is refused`);
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      `${control.label}: malformed grammar never reaches native planning`);
    assert.equal(compiled.artifacts.size, 0, `${control.label}: malformed grammar never emits native artifacts`);
  }
});

test("every emitted class property has one selected physical storage record", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class View { value: number = 1; readonly count: number = 2; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "property source is checked");
  assert.equal(compiled.targetDiagnostics.length, 0, "native class property selection succeeds");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const declaration = program.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsClassDeclaration(node) && ast.text(ast.name(node)) === "View");
  const properties = ast.members(declaration).filter(node => node !== undefined && ast.is.IsPropertyDeclaration(node));
  assert.equal(properties.length, 2, "both native fields retain their original declarations");
  const context = createCsharpPlanningContext(program);
  for (const property of properties) {
    assert.equal(program.records.classPropertyStorage.get(property)?.kind, "field",
      "the single class-property producer records each exact field");
    const corrupted = { ...program, records: { ...program.records,
      classPropertyStorage: { get: () => undefined } } };
    const diagnostics = [];
    assert.throws(() => planPropertyDeclaration(property, ast.getSourceFile(property),
      { ...context, program: corrupted }, diagnostics, undefined),
    error => error.message.includes("A checked class property lost its selected native field or property storage."),
    "only deliberately corrupted admitted storage reaches the planner invariant");
    assert.equal(diagnostics.length, 0, "internal storage corruption is never relabelled as a source refusal");
  }
});

for (const surface of ["native", "js"]) {
  test(`admitted constant switch labels remain direct native syntax on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function run(value: int): int {
        switch (value) { case 1: return 2; case 3: return 4; default: return 0; }
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "native switch source is checked");
    assert.equal(compiled.targetDiagnostics.length, 0, "native switch admission retains valid constant labels");
    const output = compiled.artifacts.get("src/Index.cs");
    assert.match(output, /switch \(value\)/u, "the native switch is not replaced by a runtime dispatcher");
    assert.match(output, /case 1:/u, "the first literal remains a native constant label");
    assert.match(output, /case 3:/u, "the second literal remains a native constant label");
  });
}

for (const declarationKind of ["interface", "class"]) {
test(`${declarationKind} native heritage renderability is refused by its owner before publication`, () => {
  const checked = checkCsharpSource({ sourceText: `export ${declarationKind} View { value: number${declarationKind === "class" ? " = 1" : ""}; }` });
  assert.equal(checked.sourceDiagnosticsText, "", "the admission witness has valid native source");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declaration = source.navigation.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && (ast.is.IsInterfaceDeclaration(node) || ast.is.IsClassDeclaration(node)) &&
      ast.text(ast.name(node)) === "View");
  assert.equal(declaration !== undefined, true, "the checked interface is present");
  const issues = admitCsharpNativeDeclarations(ast, [declaration], { order: () => [] },
    { heritageForDeclaration: () => ({ interfaces: [{ kind: "opaque", id: "missing" }] }) },
    { compileTimeMetadata: { get: () => false } }, { storageType: { get: () => undefined } },
    { get: () => undefined }, { get: () => false });
  assert.equal(issues.length, 1, "one pre-seal declaration owner refuses the native carrier");
  assert.equal(issues[0]?.code, "CSHARP_UNSUPPORTED_AST", "the original refusal code is retained");
  assert.equal(issues[0]?.message, "Canonical project heritage contains a target type that cannot be rendered in C#.",
    "the original refusal message is retained");
  assert.equal(issues[0]?.sourceNode === declaration, true, "the refusal stays on its exact source declaration");
});
}

test("declaration admission consumes exact retained masks, not empty construction order guesses", () => {
  const checked = checkCsharpSource({ sourceText: "export class View {}" });
  assert.equal(checked.sourceDiagnosticsText, "", "the empty native class is valid");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declaration = source.navigation.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsClassDeclaration(node));
  for (const control of [
    { label: "retained empty class", participation: undefined, metadata: false, unreachable: false, count: 1 },
    { label: "erased participation", participation: "erased", metadata: false, unreachable: false, count: 0 },
    { label: "compile-time metadata", participation: undefined, metadata: true, unreachable: false, count: 0 },
    { label: "native unreachable", participation: undefined, metadata: false, unreachable: true, count: 0 },
  ]) {
    const issues = admitCsharpNativeDeclarations(ast, [declaration], { order: () => [] },
      { heritageForDeclaration: () => ({ interfaces: [{ kind: "opaque", id: "missing" }] }) },
      { compileTimeMetadata: { get: () => control.metadata } }, { storageType: { get: () => undefined } },
      { get: () => control.participation }, { get: () => control.unreachable });
    assert.equal(issues.length, control.count, `${control.label}: only final producer masks decide participation`);
  }
});

for (const surface of ["native", "js"]) {
  test(`declaration source refusals publish neither records nor artifacts on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: "export class View { static value: string; }" });
    assert.equal(compiled.sourceDiagnosticsText, "", "the declared non-nullable field is checked source");
    assert.equal(compiled.targetDiagnostics.length, 1, "one declaration owner refuses the incompatible native default");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED",
      "the declaration admission owner reports its precise source constraint");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "the declaration refusal happens before publication, not in the renderer");
    assert.equal(compiled.artifacts.size, 0, "the same declaration owner cannot publish partial artifacts");
  });

  test(`runtime-shape modifier refusals have one pre-seal declaration owner on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: "export class View { accessor value: number = 1; }" });
    assert.equal(compiled.sourceDiagnosticsText, "", "the auto-accessor is valid checked TypeScript");
    assert.equal(compiled.targetDiagnostics.length, 1, "the source modifier is refused exactly once");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_UNSUPPORTED_AST", "the original source code is retained");
    assert.equal(compiled.targetDiagnostics[0].message,
      "TypeScript-only modifier 'accessor' on property declaration is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.",
      "the original role and message are retained");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "modifier selection is complete before the native program is sealed");
    assert.equal(compiled.artifacts.size, 0, "no rejected modifier reaches C# emission");
  });

  test(`for-of declarations, assignment destinations and string iteration use admitted physical bindings on ${surface}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { int } from "@tsonic/csharp/types.js";
        export function sum(values: int[]): number {
          let current: number = 0;
          let total: number = 0;
          for (current of values) total += current;
          return total;
        }
        export function joined(values: string[]): string {
          let text = "";
          for (const value of values) text += value;
          return text;
        }
        export function characters(value: string): string {
          let text = "";
          for (const character of value) text += character;
          return text;
        }
      ` });
      assert.equal(compiled.sourceDiagnosticsText, "", "native loop source is checked");
      assert.equal(compiled.targetDiagnostics.length, 0, "native binding conversions are admitted once");
      const program = compiled.result.program;
      const ast = program.source.ast;
      let count = 0;
      const visit = node => {
        if (ast.is.IsForOfStatement(node)) {
          count += 1;
          const iteration = program.records.iteration.get(node);
          assert.equal(iteration?.kind === "resolved" && iteration.iterationKind === "for-of", true,
            "every retained loop has its successful native selection");
          assert.equal(iteration.binding.storageType !== undefined && iteration.binding.conversion !== undefined, true,
            "the planner never arbitrates storage or reselects a conversion");
          assert.equal(Object.isFrozen(iteration.binding), true, "the binding is immutable at publication");
        }
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      program.sourceFiles.forEach(visit);
      assert.equal(count, 3, "all three physical binding forms are witnessed");
      executeCsharpConstruction(compiled, `admitted-for-of-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.sum(new int[] { 1, 2, 3 }) != 6 ||
    Tsonic.Generated.Index.joined(new string[] { "a", "b" }) != "ab" ||
    Tsonic.Generated.Index.characters("a😀b") != "a😀b")
    throw new System.Exception("native admitted iteration bindings");
`);
    });
}

test("published for-in records contain immutable physical bindings and conversions", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function keys(values: number[]): string {
      let text = "";
      for (const key in values) text += key;
      return text;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "for-in source is checked");
  assert.equal(compiled.targetDiagnostics.length, 0, "native key storage is admitted before publication");
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the admitted program is published");
  let loop;
  const visit = node => {
    if (program.source.ast.is.IsForInStatement(node)) loop = node;
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  const iteration = program.records.iteration.get(loop);
  assert.equal(iteration?.kind === "resolved" && iteration.iterationKind === "for-in", true,
    "only a successful native iteration payload is published");
  assert.equal(iteration.binding.kind, "declaration", "the producer decides the declaration form");
  assert.equal(iteration.binding.declarationKind, "const", "the producer retains exact source lifetime semantics");
  assert.equal(iteration.binding.conversion.kind, "identity", "the producer selects the exact native key conversion");
  assert.equal(Object.isFrozen(iteration) && Object.isFrozen(iteration.binding) && Object.isFrozen(iteration.binding.conversion), true,
    "the planner receives immutable evidence, not a selector");
});

test("catch admission owns every missing, invalid and unrenderable physical carrier refusal", () => {
  const checked = checkCsharpSource({ sourceText: `
    export function run(): void { try {} catch (error) { void error; } }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "the catch witness is valid checked source");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  let clause;
  const visit = node => {
    if (ast.is.IsCatchClause(node)) clause = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const declaration = ast.as.AsCatchClause(clause).VariableDeclaration;
  const name = ast.name(declaration);
  for (const control of [
    { label: "missing classification", throwable: undefined, carrier: undefined,
      message: "Catch variable has no sealed C# throwable classification." },
    { label: "missing physical carrier", throwable: false, carrier: undefined,
      message: "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission. C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation." },
    { label: "nonexception physical carrier", throwable: false, carrier: { kind: "source-primitive", name: "bool" },
      message: "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission. Resolved catch variable carrier is neither a target throwable carrier nor a closed TsValue catch carrier." },
    { label: "unrenderable physical carrier", throwable: true, carrier: { kind: "opaque", id: "missing" },
      message: "Catch variable carrier must render to a closed C# type before C# emission." },
  ]) {
    const issues = admitCsharpStatementBindings(ast, [clause],
      { order: () => [{ kind: "construct", construct: declaration }] },
      { throwable: { get: () => control.throwable }, nativeUnreachable: { get: () => false } },
      { storageType: { get: () => control.carrier } }, { get: () => undefined },
      { get: () => undefined }, { get: () => false });
    assert.equal(issues.length, 1, `${control.label}: one native admission owner`);
    assert.equal(issues[0].sourceNode === name, true, `${control.label}: exact original source subject`);
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", `${control.label}: original refusal code`);
    assert.equal(issues[0].message, control.message, `${control.label}: original refusal message`);
  }
});

for (const surface of ["native", "js"]) {
  test(`generator resource refusal occurs before program or artifact publication on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      class Resource { [Symbol.dispose](): void {} }
      export function* values(): Generator<int, void, unknown> {
        using resource = new Resource();
        yield 1;
        void resource;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the source has exact checked resource evidence");
    assert.equal(compiled.targetDiagnostics.length, 1, "one native resource-scope owner refuses the unsupported suppression");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_GENERATOR_RESOURCE_MANAGEMENT_NOT_PROVEN",
      "the original native refusal code is preserved");
    assert.equal(compiled.targetDiagnostics[0].message,
      "Native C# iterator finally blocks cannot preserve SuppressedError composition when both generator execution and disposal fail.",
      "the original suppression constraint is preserved");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a refused resource scope never publishes native records or a plan");
    assert.equal(compiled.artifacts.size, 0, "a refused resource scope never emits partial native artifacts");
  });
}
