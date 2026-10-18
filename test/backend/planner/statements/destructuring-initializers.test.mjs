import assert from "node:assert/strict";
import test from "node:test";
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
        ready: [int] = ([selected] = next(7));
        read(): int { return this.ready[0]; }
      }
      export function run(): int { const ready = View.ready[0]; const view = new View(); return view.read() + ready + selected + calls; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `class-initializer-destructuring-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 20) throw new System.Exception("native initializer scope and exactly-once order");
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
