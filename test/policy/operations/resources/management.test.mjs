import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { selectCsharpResourceManagement } from "../../../../dist/analysis/control-flow/resource-management.js";

function fixture() {
  const compiled = compileCsharpSource({ sourceText: `
    class Resource { [Symbol.dispose](): void {} }
    export function use(): void { using resource = new Resource(); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  // nextgen C-2542: the analysis program's received TargetSourceProgramFacts (syntax, sourceFiles) keys the records.
  const source = compiled.result.program.source;
  const file = source.sourceFiles.find(node => source.syntax.getFileName(node) === "/project/index.ts");
  let declaration;
  const visit = node => {
    if (source.syntax.is.IsVariableDeclaration(node) && source.syntax.variableDeclarationKind(node) === "using") declaration = node;
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(declaration !== undefined, true);
  const original = compiled.result.program.records.resource.get(declaration);
  assert.equal(original.kind, "resolved");
  assert.equal(original.registration.kind, "direct");
  // nextgen C-2542: the C# owner reads facts.selections.resource(declaration).alternatives (kind, Host descriptor) and
  // represents each alternative through CsharpTypeQueries.represent; the published selection is extended with one
  // sync alternative over a fixture descriptor (request R-T6-7: the public SourceResourceSelection has no alternatives).
  const alternative = Object.freeze({ kind: "sync", type: Object.freeze({ kind: "declared", declaration: {}, typeArguments: [] }) });
  const selected = Object.freeze({ ...original.source, alternatives: Object.freeze([alternative]) });
  const carrier = original.registration.resourceType;
  const resource = selection => ({ selections: { resource: subject => {
    assert.equal(subject === declaration, true);
    return selection;
  } } });
  const input = { typeDefinitions: compiled.result.program.typeDefinitions, facts: resource(selected),
    types: { storage: () => carrier, represent: type => {
      assert.equal(type === alternative.type, true);
      return carrier;
    } },
  };
  return { declaration, file, selected, carrier, input, resource };
}

test("C# resource selection preserves exact checked carrier and one canonical disposal operation", () => {
  const current = fixture();
  const duplicated = { ...current.selected,
    alternatives: [current.selected.alternatives[0], { ...current.selected.alternatives[0] }] };
  const input = { ...current.input, facts: current.resource(duplicated) };
  const result = selectCsharpResourceManagement(input, current.declaration);
  assert.equal(result.kind, "resolved");
  assert.equal(result.source === duplicated, true);
  assert.equal(result.registration.kind, "direct");
  assert.equal(result.registration.resourceType === current.carrier, true);
  assert.deepEqual(result.registration.disposal, { kind: "sync", targetName: "Dispose" });
});

test("C# rejects contradictory disposal protocols for one exact native resource carrier", () => {
  const current = fixture();
  const contradictory = { ...current.selected,
    alternatives: [current.selected.alternatives[0], { ...current.selected.alternatives[0], kind: "async" }] };
  const input = { ...current.input, facts: current.resource(contradictory) };
  const result = selectCsharpResourceManagement(input, current.declaration);
  assert.equal(result.kind, "rejected");
  assert.equal(result.reason,
    "Source resource alternatives that share one C# carrier must select one identical disposal operation.");
});
