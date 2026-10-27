import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function thenCalls(compiled) {
  const { ast, sourceFiles } = compiled.source;
  const calls = [];
  const visit = node => {
    if (ast.is.IsCallExpression(node)) {
      const file = ast.getSourceFile(node);
      const text = ast.getSourceText(file).slice(ast.pos(node), ast.end(node)).trim();
      if (text.startsWith("pending.then")) calls.push(node);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of sourceFiles) if (!ast.isDeclarationFile(file)) visit(file);
  return calls.map(node => compiled.result.program.records.selectedCall.get(node));
}

export { thenCalls };
