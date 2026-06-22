import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

test("C# backend exposes Roslyn syntax as the only output AST boundary", async () => {
  assert.equal(existsSync(join(root, "src/backend/ast/csharp-ast.ts")), false);
  assert.equal(existsSync(join(root, "src/backend/roslyn/syntax.ts")), true);

  const syntax = await readFile(join(root, "src/backend/roslyn/syntax.ts"), "utf8");
  assert.match(syntax, /from "\.\/syntax\/declarations\.js"/);
  assert.match(syntax, /from "\.\/syntax\/members\.js"/);
  assert.match(syntax, /from "\.\/syntax\/expressions\.js"/);
  assert.match(syntax, /from "\.\/syntax\/statements\.js"/);

  const declarations = await readFile(join(root, "src/backend/roslyn/syntax/declarations.ts"), "utf8");
  const members = await readFile(join(root, "src/backend/roslyn/syntax/members.ts"), "utf8");
  const expressions = await readFile(join(root, "src/backend/roslyn/syntax/expressions.ts"), "utf8");
  const statements = await readFile(join(root, "src/backend/roslyn/syntax/statements.ts"), "utf8");
  assert.match(declarations, /kind: "CompilationUnit"/);
  assert.match(members, /kind: "MethodDeclaration"/);
  assert.match(expressions, /kind: "InvocationExpression"/);
  assert.match(expressions, /kind: "AssignmentExpression"/);
  assert.match(expressions, /operatorToken: CsharpBinaryOperatorToken/);
  assert.doesNotMatch(expressions, /operator: string/);
  assert.match(statements, /kind: "LocalDeclarationStatement"/);

  const sources = await collectSourceFiles(join(root, "src"));
  for (const source of sources) {
    const text = await readFile(source, "utf8");
    assert.equal(text.includes("backend/ast/csharp-ast"), false, source);
    assert.equal(text.includes("../ast/csharp-ast"), false, source);
  }
});

test("printer and planner do not emit legacy custom statement kind names", async () => {
  const sources = [
    ...(await collectSourceFiles(join(root, "src/backend/planner"))),
    ...(await collectSourceFiles(join(root, "src/print"))),
  ];
  const banned = [
    'kind: "expression"',
    'kind: "local"',
    'kind: "return"',
    'kind: "block"',
    'kind: "switch"',
    'kind: "case"',
    'kind: "default"',
  ];
  for (const source of sources) {
    const text = await readFile(source, "utf8");
    for (const token of banned) {
      assert.equal(text.includes(token), false, `${source} contains ${token}`);
    }
  }
});

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}
