import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

function handlersByCallee(program) {
  const ast = program.source.ast;
  const handlers = [];
  for (const sourceFile of program.sourceFiles) {
    const text = String(ast.getSourceText(sourceFile));
    const visit = (node) => {
      if (ast.is.IsCallExpression(node)) {
        const callee = ast.as.AsCallExpression(node)?.Expression;
        handlers.push([text.slice(ast.pos(callee), ast.end(callee)).trim(), program.records.nativeHandler.get(node) ?? "none"]);
      }
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    visit(sourceFile);
  }
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
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.diagnostics.length === 0, true,
    compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  assert.equal(typeof program?.records.nativeHandler?.get === "function", true,
    "the published program carries the nativeHandler reader");
  const handlers = handlersByCallee(program);
  const expected = [["directUnsafe", "explicit-safety"], ["loadnativeptr", "native-pointer"], ["unsafe", "none"]];
  assert.equal(handlers.length === expected.length, true,
    `three calls in source order, recorded ${handlers.map(([callee, handler]) => `${callee}=${handler}`).join(", ")}`);
  for (const [index, [callee, handler]] of expected.entries()) {
    assert.equal(handlers[index][0] === callee && handlers[index][1] === handler, true,
      `call ${index}: ${callee} claimed by ${handler}, recorded ${handlers[index][0]}=${handlers[index][1]}`);
  }
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes("return unsafe(*pointer);"), true, "the explicit-safety handler emits the unsafe expression");
});
