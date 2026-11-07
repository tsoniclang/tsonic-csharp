import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of ["native", "js"]) {
  for (const expression of ["((1))", "((-1))"]) {
    test(`${surface}: a converted constructed literal retains its exact recipe for ${expression}`, () => {
      const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
import type { int32, uint32 } from "@tsonic/core/types.js";
export function run(signed: int32, unsigned: uint32): (int32 | uint32 | number)[] {
  return [signed, unsigned, ${expression}];
}` });
      assertCsharpCompilationSucceeded(compiled);
      const program = compiled.result.program;
      const ast = program.source.syntax;
      const wrappers = [];
      const pending = [...csharpProgramSourceFiles(program)];
      while (pending.length > 0) {
        const node = pending.pop();
        if (ast.is.IsParenthesizedExpression(node)) wrappers.push(node);
        ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
      }
      const outer = wrappers.find(node => ast.getSourceText(ast.getSourceFile(node))
        .slice(ast.pos(node), ast.end(node)).trim() === expression);
      assert.equal(outer !== undefined, true, "the actual authored wrapper is retained");
      const emission = program.records.nativeExpression.get(outer);
      assert.equal(emission?.use.kind === "converted" && emission.physical?.kind === "constructed" &&
        emission.physical.literal !== undefined && emission.physical.children.length === 0, true,
      "one exact folded construction recipe owns emission without requesting unselected inner expressions");
      assert.equal(compiled.artifacts.size > 0, true, "the same literal construction reaches real emission");
    });
  }
}
