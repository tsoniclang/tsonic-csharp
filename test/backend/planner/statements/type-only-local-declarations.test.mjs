import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planStatements } from "../../../../dist/backend/planner/statements/planning.js";

for (const surface of ["native", "js"]) {
  test(`${surface} checked local aliases add no executable statements`, () => {
    const baseline = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        let total = 0;
        for (let index = 0; index < 3; index++) {
          total += index;
        }
        return total;
      }
    ` });
    const aliased = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        type Counter = number;
        let total: Counter = 0;
        for (let index = 0; index < 3; index++) {
          type Callback = (count: number) => number;
          total += index;
        }
        return total;
      }
    ` });
    assertCsharpCompilationSucceeded(baseline);
    assertCsharpCompilationSucceeded(aliased);
    assert.equal(aliased.artifacts.size, baseline.artifacts.size);
    for (const [path, source] of baseline.artifacts) {
      assert.equal(aliased.artifacts.get(path), source, `unchanged native artifact ${path}`);
    }
  });

  test(`${surface} statement callers cannot route module-only declarations into body planning`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      namespace Hidden {}
      export function run(): number { return 1; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the namespace is a real checked top-level source form");
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the unchanged module dispatcher owns this late source refusal");
    const errors = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(errors.length, 1, "the foreign module obligation keeps its exact one existing refusal");
    assert.equal(errors[0].code, "CSHARP_UNSUPPORTED_AST", "the foreign source code is unchanged");
    assert.equal(errors[0].message, "Top-level statement is outside the current C# planning surface.",
      "the foreign late refusal is not relabelled as an internal error");
    const ast = program.source.ast;
    const node = errors[0].sourceNode;
    assert.equal(node !== undefined && ast.is.IsModuleDeclaration(node), true,
      "the exact original top-level namespace remains the foreign diagnostic subject");
    assert.equal(compiled.artifacts.size, 0, "the unsupported module form still emits no artifacts");
    const diagnostics = [];
    assert.throws(() => planStatements(node, ast.getSourceFile(node), createCsharpPlanningContext(program), diagnostics),
      error => error.message.includes("statement planner caller contract"),
      "only a deliberately corrupted caller routing reaches the body-planner invariant");
    assert.equal(diagnostics.length, 0, "the invariant cannot create a competing source rejection");
  });
}
