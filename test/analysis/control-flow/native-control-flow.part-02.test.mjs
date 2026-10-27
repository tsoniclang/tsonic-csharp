import assert from "node:assert/strict";
import test from "node:test";
import { nativeFinallyOverrideSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/native-value-declarations.js";
import { admitCsharpNativeStorageBindings, admitCsharpStatementBindings } from "../../../dist/analysis/control-flow/native-control-flow.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planPropertyDeclaration } from "../../../dist/backend/planner/declarations/classes/properties.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpTypeForExpressionCarrier, planBindingPatternFromExpression } from "../../../dist/backend/planner/bindings/binding-patterns.js";
import { createDestructuringPlannerState } from "../../../dist/backend/planner/bindings/binding-state.js";
import { planCsharpGeneratedMethodCall } from "../../../dist/backend/planner/declarations/generated-methods.js";
import { planBreakStatement, planContinueStatement, planReturnStatement } from "../../../dist/backend/planner/statements/statement-simple.js";
import { planLocalDeclarationStatements } from "../../../dist/backend/planner/bindings/locals.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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
      csharpProgramSourceFiles(program).forEach(visit);
      assert.equal(count, 3, "all three physical binding forms are witnessed");
      const integers = surface === "js"
        ? "new global::Tsonic.CSharp.Js.JSArray<int>(new int[] { 1, 2, 3 })" : "new int[] { 1, 2, 3 }";
      const strings = surface === "js"
        ? "new global::Tsonic.CSharp.Js.JSArray<string>(new string[] { \"a\", \"b\" })" : "new string[] { \"a\", \"b\" }";
      executeCsharpConstruction(compiled, `admitted-for-of-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.sum(${integers}) != 6 ||
    Tsonic.Generated.Index.joined(${strings}) != "ab" ||
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
  csharpProgramSourceFiles(program).forEach(visit);
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
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

test(`a yield binding-pattern refusal belongs to statement admission on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function* values(): Generator<int, void, int[]> {
        const [value] = yield 1;
        void value;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the post-resume binding pattern is checked source");
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "one statement owner retains the existing unsupported post-resume refusal");
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the original source refusal code is unchanged");
    assert.equal(issues[0].message,
      "A yield initializer with a binding pattern requires an explicit post-resume destructuring plan.",
      "the original source refusal message is unchanged");
    const ast = createTargetSourceProgram(compiled.source).ast;
    assert.equal(ast.is.IsArrayBindingPattern(issues[0].sourceNode), true,
      "the exact authored binding pattern remains the diagnostic subject");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "a refused post-resume binding never publishes records, a plan or artifacts");
    const declaration = ast.parent(issues[0].sourceNode);
    const state = createDestructuringPlannerState(declaration, ast);
    state.generator = {};
    const diagnostics = [];
    assert.throws(() => planLocalDeclarationStatements(declaration, ast.getSourceFile(declaration),
      { program: { source: { ast }, records: { compileTimeMetadata: { get: () => false },
        localBinding: { get: () => undefined } } } }, diagnostics, state),
    error => error.message.includes("post-resume identifier binding"),
    "only bypassing successful admission exposes the checked-pattern corruption invariant");
    assert.equal(diagnostics.length, 0, "the renderer cannot repeat the pre-seal source refusal");
  });
}
