// Planner fixtures built from a compiled source: the sealed records of a real C# compilation and the planning context
// the planner builds from them (createCsharpPlanningContext), so a planner test never hand-writes an analysis decision.
import assert from "node:assert/strict";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "./direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../dist/backend/planner/context.js";
import { sealCsharpAnalysisProgram } from "../../dist/analysis/program/index.js";
import { csharpProgramSourceFiles } from "./program-source-files.mjs";

export function compiledCsharpPlanContext(sourceText, surface) {
  const compiled = compileCsharpSource({ sourceText, surface });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const { ast } = program.source;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  csharpProgramSourceFiles(program).forEach(visit);
  return { compiled, program, ast, nodes, input: createCsharpPlanningContext(sealCsharpAnalysisProgram(program)),
    sourceFile: node => ast.getSourceFile(node),
    text: node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim(),
    find(kindName, text) {
      const found = nodes.filter(node => ast.kindName(node) === kindName && this.text(node) === text);
      assert.equal(found.length, 1, `one ${kindName} '${text}'`);
      return found[0];
    } };
}
