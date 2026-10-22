import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpProjectEmission } from "../../../dist/analysis/project-types/emission.js";

test("project type emission queries checked reference syntax, never import containers", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": 'import type { Item as Model } from "./model.js"; export function keep(value: Model): Model { return value; }',
    "/src/model.ts": "export class Item { value: number = 1; }",
  }, compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true, target: "es2022" } }).checkSource();
  const diagnostics = checked.diagnostics.filter(diagnostic => diagnostic !== undefined);
  assert.equal(diagnostics.length, 0, formatDiagnostics(diagnostics).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(checked.getSourceFile("/src/index.ts"));
  visit(checked.getSourceFile("/src/model.ts"));
  const selected = analyzeCsharpProjectEmission({ source, nodes,
    projectTypes: { definitionContainingDeclaration: () => undefined },
    factories: { classFactory: { get: () => undefined } },
    evidence: { providerVirtualDeclaration: { get: () => undefined } },
    names: { typeParameterNames: [] },
    projections: { genericProjection: { get: () => [] } },
  });
  assert.equal(selected.issues.length, 0, "checked type references are admitted before sealing");
  const clause = nodes.find(source.ast.is.IsImportClause);
  assert.equal(clause !== undefined, true, "the source contains the exact formerly invalid checker query subject");
  assert.equal(selected.records.projectSourceReference.get(clause) === undefined, true, "an import container has no native type-reference occurrence");
  const typeReference = nodes.find(source.ast.is.IsTypeReferenceNode);
  const declaration = selected.records.projectSourceReference.get(typeReference);
  assert.equal(declaration !== undefined, true, "the actual source type-reference occurrence retains its project declaration");
  assert.equal(source.ast.text(source.ast.name(declaration)), "Item", "aliasing preserves the exact declaration identity");
});
