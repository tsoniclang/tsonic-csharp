import assert from "node:assert/strict";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";

export function checkedSourceLiteralValues(spellings) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/literal-proof", files: {
    "/literal-proof/index.ts": spellings.map((text, index) => `export const value${index} = ${text};`).join("\n"),
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the native token fixtures check");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/literal-proof/index.ts");
  assert.equal(file !== undefined, true, "the fixture file exists");
  const initializers = [];
  const visit = node => {
    const initializer = source.ast.as.AsVariableDeclaration(node)?.Initializer;
    if (initializer !== undefined) initializers.push(initializer);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const records = analyzeSourceLiteralValues(source.ast, [file]);
  assert.equal(initializers.length, spellings.length, "each spelling has one checked initializer");
  return Object.freeze(initializers.map((node, index) => {
    const value = records.literalValue.get(node);
    assert.equal(value !== undefined, true, `literal evidence ${index}`);
    return value;
  }));
}
