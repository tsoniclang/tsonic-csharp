import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { tryPlanDestructuringAssignmentExpression } from "../../../../dist/backend/planner/bindings/destructuring-assignment.js";
import { planExpression } from "../../../../dist/backend/planner/expressions/index.js";

for (const surface of ["native", "js"]) {
  for (const [name, pattern, initializer] of [
    ["object", "{ index }", "{ index: 0 }"],
    ["array", "[index]", "[0]"],
    ["nested object", "{ nested: { index } }", "{ nested: { index: 0 } }"],
    ["nested array", "[[index]]", "[[0]]"],
  ]) {
    test(`${surface} ${name} destructuring consumes its exact inferred initializer type`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        export function local(): number {
          const ${pattern} = ${initializer};
          return index;
        }
        export function counted(): number {
          let selected = () => -1;
          for (let ${pattern} = ${initializer}; index < 6; index++) {
            selected = () => index;
            index += 1;
          }
          return selected();
        }
      ` });
      assertCsharpCompilationSucceeded(compiled);
      const source = [...compiled.artifacts.values()].join("\n");
      assert.equal(/\bdynamic\b|Activator\.|Unsafe\./u.test(source), false);
      assert.equal(/\bfor\s*\(/u.test(source), true);
      assert.equal(/\b__tsonic_destructure\d+\b/u.test(source), true);
    });
  }
}

for (const surface of ["native", "js"]) {
  test(`${surface} field and static initializers retain their destructuring rendering scope and evaluation order`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      let selected: int = 0;
      let calls: int = 0;
      function next(value: int): [int] { calls += 1; return [value]; }
      class View {
        static ready: [int] = ([selected] = next(4));
        instanceReady: [int] = ([selected] = next(7));
        read(): int { return this.instanceReady[0]; }
      }
      export function run(): int { const ready = View.ready[0]; const view = new View(); return view.read() + ready + selected + calls; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `class-initializer-destructuring-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 20) throw new System.Exception("native initializer scope and exactly-once order");
`);
  });
}

for (const surface of ["native", "js"]) {
  for (const control of [
    { label: "field", name: "ready", nativeCode: "CS0102", sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      let selected: int = 0;
      let calls: int = 0;
      function next(value: int): [int] { calls += 1; return [value]; }
      class View {
        static ready: [int] = ([selected] = next(4));
        ready: [int] = ([selected] = next(7));
        read(): int { return this.ready[0]; }
      }
      export function run(): int { const ready = View.ready[0]; const view = new View(); return view.read() + ready + selected + calls; }
    ` },
    { label: "method", name: "read", nativeCode: "CS0111", sourceText: `
      export class View {
        static read(): number { return 1; }
        read(): number { return 2; }
      }
      export function run(): number { return View.read() + new View().read(); }
    ` },
    { label: "accessor", name: "ready", nativeCode: "CS0102", sourceText: `
      export class View {
        static get ready(): number { return 1; }
        static set ready(value: number) { void value; }
        get ready(): number { return 2; }
        set ready(value: number) { void value; }
      }
      export function run(): number { return View.ready + new View().ready; }
    ` },
    { label: "generic method", name: "read", nativeCode: "CS0111", sourceText: `
      export class View {
        static read<T>(value: T): T { return value; }
        read<U>(value: U): U { return value; }
      }
    ` },
    { label: "nullable-reference method", name: "read", nativeCode: "CS0111", sourceText: `
      export class View {
        static read(value: string): number { return 1; }
        read(value: string | undefined): number { return 2; }
      }
      export function run(): number { return View.read("a") + new View().read(undefined); }
    ` },
    { label: "keyword method", name: "event", emittedName: "@event", nativeCode: "CS0111", sourceText: `
      export class View {
        static event(): number { return 1; }
        event(): number { return 2; }
      }
    ` },
  ]) {
    test(`${surface} static and instance ${control.label} collisions are refused before native publication`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: control.sourceText });
      assert.equal(compiled.sourceDiagnosticsText, "", "the original colliding members are checked TypeScript");
      assert.equal(compiled.targetDiagnostics.length, 1, "one native member-name owner reports the conflicting pair");
      const diagnostic = compiled.result.diagnostics[0];
      assert.equal(diagnostic.code, "CSHARP_INVALID_IDENTIFIER", "the existing native-name refusal code is used");
      assert.equal(diagnostic.message,
        `Static member '${control.emittedName ?? control.name}' and instance member '${control.emittedName ?? control.name}' cannot share the emitted C# name '${control.emittedName ?? control.name}' (${control.nativeCode}).`,
        "the exact refusal identifies both members and the native C# constraint");
      const source = createTargetSourceProgram(compiled.source);
      const ast = source.ast;
      let subject;
      const visit = node => {
        const name = ast.name(node);
        if (subject === undefined && name !== undefined && ast.is.IsIdentifier(name) && ast.text(name) === control.name &&
          (ast.is.IsPropertyDeclaration(node) || ast.is.IsMethodDeclaration(node) || ast.kindName(node) === "KindGetAccessor") &&
          !ast.hasModifierKind(node, "static")) subject = name;
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      source.navigation.sourceFiles.forEach(visit);
      assert.equal(subject !== undefined && diagnostic.sourceNode === subject, true,
        "the exact second authored member name owns the refusal");
      assert.equal(compiled.artifacts.size, 0, "the native name collision emits no artifacts");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
        "the pair is refused before successful program publication or planning");
    });
  }
  test(`${surface} native member-name admission preserves distinct overloads and inherited hiding`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export class Overloaded {
        static read(value: number): number { return value; }
        read(): number { return 2; }
      }
      class Base { read(): number { return 3; } }
      export class Hidden extends Base { static read(): number { return 4; } }
      export function run(): number { return Overloaded.read(3) + new Overloaded().read() + new Base().read() + Hidden.read(); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-overloads-and-hiding-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 12) throw new System.Exception("native overload and inherited member identity");
`);
  });
}

test("destructuring assignment operation, pattern and rendering scope are independent producer guarantees", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(): number { let value = 0; [value] = [7]; return value; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const ast = program.source.ast;
  let assignment;
  const visit = node => {
    if (program.records.binaryOperation.get(node)?.destructuring?.kind === "resolved") assignment = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(assignment !== undefined, true, "the checked assignment has its exact admitted native operation");
  const file = ast.getSourceFile(assignment);
  for (const control of [
    { label: "operation", family: "binaryOperation", message: "resolved native operation" },
    { label: "pattern", family: "bindingPatternProjection", message: "exact checked assignment pattern" },
    { label: "scope", message: "owning native rendering scope" },
  ]) {
    const records = control.family === undefined ? program.records : { ...program.records,
      [control.family]: { get: node => node === assignment ? undefined : program.records[control.family].get(node) } };
    const input = createCsharpPlanningContext({ ...program, records });
    const diagnostics = [];
    const state = control.label === "scope" ? undefined : createDestructuringPlannerState(assignment, ast);
    assert.throws(() => tryPlanDestructuringAssignmentExpression(assignment, file, input, diagnostics, state, planExpression),
      error => error.message.includes(control.message), `${control.label}: exact corrupted evidence cannot reach rendering`);
    assert.equal(diagnostics.length, 0, `${control.label}: broken producer evidence is not another source rejection`);
  }
});

test("nested destructuring assignments reuse the owning native scope", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(): number { let first = 0; let second = 0; [first] = ([second] = [7]); return first + second; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "nested-assignment-rendering-scope", false, false, [], `
if (Tsonic.Generated.Index.run() != 14) throw new System.Exception("nested assignment scope");
`);
});
