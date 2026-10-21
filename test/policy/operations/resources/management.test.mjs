import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { selectCsharpResourceManagement } from "../../../../dist/analysis/control-flow/resource-management.js";

function fixture() {
  const compiled = compileCsharpSource({ sourceText: `
    class Resource { [Symbol.dispose](): void {} }
    export function use(): void { using resource = new Resource(); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  const source = createTargetSourceProgram(compiled.source);
  const file = source.navigation.sourceFiles.find(node => source.ast.getFileName(node) === "/project/index.ts");
  let declaration;
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node) && source.ast.variableDeclarationKind(node) === "using") declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(declaration !== undefined, true);
  const original = compiled.result.program.records.resource.get(declaration);
  assert.equal(original.kind, "resolved");
  assert.equal(original.registration.kind, "direct");
  const selected = original.source;
  const carrier = original.registration.resourceType;
  const input = { typeDefinitions: compiled.result.program.typeDefinitions,
    semantics: () => ({ operations: { resourceManagement: subject => {
      assert.equal(subject === declaration, true);
      return selected;
    } } }),
    types: { resolveStorage: () => carrier, resolveType: type => {
      assert.equal(type === selected.disposal.alternatives[0].sourceType, true);
      return carrier;
    } },
  };
  return { declaration, file, selected, carrier, input };
}

test("C# resource selection preserves exact checked carrier and one canonical disposal operation", () => {
  const current = fixture();
  const duplicated = { ...current.selected, disposal: { ...current.selected.disposal,
    alternatives: [current.selected.disposal.alternatives[0], { ...current.selected.disposal.alternatives[0] }] } };
  const input = { ...current.input, semantics: () => ({ operations: { resourceManagement: () => duplicated } }) };
  const result = selectCsharpResourceManagement(input, current.declaration, current.file);
  assert.equal(result.kind, "resolved");
  assert.equal(result.source === duplicated, true);
  assert.equal(result.registration.kind, "direct");
  assert.equal(result.registration.resourceType === current.carrier, true);
  assert.deepEqual(result.registration.disposal, { kind: "sync", targetName: "Dispose" });
});

test("C# rejects contradictory disposal protocols for one exact native resource carrier", () => {
  const current = fixture();
  const contradictory = { ...current.selected, disposal: { ...current.selected.disposal,
    alternatives: [current.selected.disposal.alternatives[0], { ...current.selected.disposal.alternatives[0], kind: "async" }] } };
  const input = { ...current.input, semantics: () => ({ operations: { resourceManagement: () => contradictory } }) };
  const result = selectCsharpResourceManagement(input, current.declaration, current.file);
  assert.equal(result.kind, "rejected");
  assert.equal(result.reason,
    "Source resource alternatives that share one C# carrier must select one identical disposal operation.");
});
