import { csharpTestSourceProgram } from "./target-source-program.mjs";
import assert from "node:assert/strict";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";

export function checkedSourceLiteralValues(spellings) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/literal-proof", files: {
    "/literal-proof/index.ts": spellings.map((text, index) => `export const value${index} = ${text};`).join("\n"),
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the native token fixtures check");
  const source = csharpTestSourceProgram(checked);
  const file = checked.getSourceFile("/literal-proof/index.ts");
  assert.equal(file !== undefined, true, "the fixture file exists");
  const initializers = [];
  const visit = node => {
    const initializer = source.syntax.as.AsVariableDeclaration(node)?.Initializer;
    if (initializer !== undefined) initializers.push(initializer);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(initializers.length, spellings.length, "each spelling has one checked initializer");
  return Object.freeze(initializers.map((node, index) => {
    // The Host literal publication (facts.values.literal is the literal index, B2 §1; nextgen C-2542).
    const value = source.facts.values.literal(node);
    assert.equal(value !== undefined, true, `literal evidence ${index}`);
    return value;
  }));
}
