import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { isCsharpJsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

test("a later guarded extraction cannot promote its broad producer storage", () => {
  const checkOptions = { surface: "js", sourceText: `
    export function append(target: Record<string, unknown>, key: string, value: string): void {
      const current = target[key];
      if (current === undefined) return;
      if (Array.isArray(current)) { const items = current as string[]; items.push(value); return; }
      target[key] = String(current);
    }
  ` };
  const checked = checkCsharpSource(checkOptions);
  assert.equal(checked.sourceDiagnosticsText, "");
  assert.deepEqual(checked.extensionDiagnostics, []);
  const { source, analysis } = withCsharpSessionRequest(checkOptions, request => ({ source: request.input.source,
    analysis: analyzeCsharpAnalysisProgram(request) })).value;
  assert.equal(analysis.kind, "resolved");
  assertNoTargetDiagnostics(analysis.diagnostics);
  const program = analysis.value;
  let references = 0;
  const visit = node => {
    if ((source.ast.is.IsIdentifier(node) && source.ast.text(node) === "current") ||
      (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "current")) {
      assert.equal(isCsharpJsValueTargetType(program.records.storageType.get(node)), true);
      assert.equal(program.records.requiredStorageType.get(node), undefined);
      references++;
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  assert.equal(references, 6);
});
