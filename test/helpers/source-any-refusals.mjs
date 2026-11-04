import assert from "node:assert/strict";
import { createSourceDiagnosticSpanReader, createTargetSourceProgram, IsTypeSyntaxNode } from "@tsonic/target-api/source";
import { finalizeTargetDiagnostics } from "../../../tsonic/packages/host/dist/diagnostics.js";
import { assertCsharpCheckingSucceeded } from "./direct-csharp-session.mjs";

export function assertCanonicalAnyRefusal(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1,
    `one canonical source-any refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
  const issue = issues[0];
  assert.equal(issue.code, "TSONIC_ANY_UNSUPPORTED");
  assert.equal(issue.message,
    "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
  assert.equal(issue.source, "tsonic-csharp");
  const source = createTargetSourceProgram(compiled.source);
  const { ast } = source;
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) {
    if (!ast.isDeclarationFile(file)) visit(file);
  }
  const node = issue.sourceNode;
  assert.equal(node !== undefined && nodes.has(node), true,
    "the refusal retains its identical checked project-source occurrence");
  const file = ast.getSourceFile(node);
  const queries = source.semantics.forFile(file);
  const type = IsTypeSyntaxNode(ast, node)
    ? queries.types.authoredType(node)
    : queries.types.expressionType(node);
  assert.equal(type !== undefined && queries.types.isAny(type), true,
    "the actual checked any occurrence owns the refusal, not a typed native producer");
  const span = createSourceDiagnosticSpanReader(ast)(file, ast.pos(node), ast.end(node));
  assert.equal(span !== undefined, true, "the original checked occurrence has an authored source span");
  const finalized = finalizeTargetDiagnostics(compiled.source, [issue], "/project")[0];
  assert.deepEqual(finalized.sourceSpan, { ...span, fileName: "index.ts" },
    "the exact checked source coordinates survive diagnostic publication");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "source-any admission publishes no native facts, output plan or artifacts");
}
