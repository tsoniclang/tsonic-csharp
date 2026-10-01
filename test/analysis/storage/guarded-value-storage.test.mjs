import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { isCsharpJsValueTargetType } from "../../../dist/target-model/types/runtime-carriers.js";

test("a later guarded extraction cannot promote its broad producer storage", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    export function append(target: Record<string, unknown>, key: string, value: string): void {
      const current = target[key];
      if (current === undefined) return;
      if (Array.isArray(current)) { const items = current as string[]; items.push(value); return; }
      target[key] = String(current);
    }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "");
  assert.deepEqual(checked.extensionDiagnostics, []);
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assert.deepEqual(analysis.diagnostics, []);
  const program = analysis.value;
  let references = 0;
  const visit = node => {
    if ((source.ast.is.IsIdentifier(node) && source.ast.text(node) === "current") ||
      (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "current")) {
      assert.equal(isCsharpJsValueTargetType(program.storage.type(node)), true);
      assert.equal(program.storage.requiredType(node), undefined);
      references++;
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  assert.equal(references, 6);
});
