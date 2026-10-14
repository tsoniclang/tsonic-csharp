import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

function handlersByCallee(compiled) {
  const program = compiled.result.program;
  const ast = program.source.ast;
  const text = String(ast.getSourceText(program.sourceFiles.find(sourceFile =>
    String(ast.getPath(sourceFile)).endsWith("/index.ts"))));
  const handlers = [];
  const visit = (node) => {
    if (ast.is.IsCallExpression(node)) {
      const callee = ast.as.AsCallExpression(node)?.Expression;
      handlers.push([text.slice(ast.pos(callee), ast.end(callee)).trim(), program.records.nativeHandler.get(node) ?? "none"]);
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) visit(sourceFile);
  return handlers;
}

test("the operations walk records one native handler per claimed call and none for ordinary calls", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { unsafe as directUnsafe } from "@tsonic/csharp/lang.js";
      import { loadnativeptr } from "@tsonic/core/lang.js";
      import type { ptr } from "@tsonic/csharp/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      function unsafe(value: int32): int32 { return value; }
      export function direct(pointer: ptr<int32>): int32 { return directUnsafe(loadnativeptr(pointer)); }
      export function shadowed(value: int32): int32 { return unsafe(value); }
    `,
    targetOptions: { languageDialect: "csharp15-preview" },
  });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  assert.deepEqual(handlersByCallee(compiled), [
    ["directUnsafe", "explicit-safety"],
    ["loadnativeptr", "native-pointer"],
    ["unsafe", "none"],
  ]);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes("return unsafe(*pointer);"), true, "the explicit-safety handler emits the unsafe expression");
});
