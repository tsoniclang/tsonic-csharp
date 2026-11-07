import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { compileCsharpAnalysisTarget, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpSourceNodes } from "../../../dist/analysis/program/source-nodes.js";

const sourceText = `
  import { struct, field } from "@tsonic/core/lang.js";
  import type { int32 } from "@tsonic/core/types.js";
  export const Point: { value: int32 } = struct({ value: field<int32>() });
  const Foreign: { value: int32 } = struct({ value: field<int32>() });
  export function run(): boolean { const value: typeof Point = { value: 7 }; return value.value === 7; }
`;

function selected(source, name) {
  // The published value outcome of the declaration (facts.values.type), nextgen C-2542.
  const ast = source.syntax;
  const node = csharpSourceNodes(ast, source.sourceFiles).find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  const outcome = node === undefined ? undefined : source.facts.values.type(node);
  assert.equal(node !== undefined && outcome !== undefined && outcome.kind !== "refused", true, `actual ${name} publication`);
  const call = ast.as.AsVariableDeclaration(node)?.Initializer;
  const literal = call === undefined ? undefined : ast.arguments(call)[0];
  const property = literal === undefined ? undefined : ast.properties(literal)[0];
  assert.equal(property !== undefined && outcome.memberCorrespondence?.length === 1 && outcome.memberCorrespondence[0].property === property, true,
    "the original actual input property has one published returned-origin relation");
  return { node, outcome, literal, property, pair: outcome.memberCorrespondence[0] };
}

for (const surface of ["native", "js"]) {
  test(`complete published struct correspondence replaces raw input/destination replay in ${surface}`, () => {
    let observed = false;
    const compiled = compileCsharpSource({ surface, sourceText, compileTarget(request, observer) {
      const source = request.input.source;
      const point = selected(source, "Point");
      const structure = sourceTypeDescriptorStructure(point.outcome.type);
      assert.equal(structure.kind === "shape" && structure.members.some(member => member.origin === point.pair.origin) &&
        point.pair.origin.kind === "declared" && point.pair.origin.declaration !== point.property, true,
        "the annotation's exact destination origin is not the original input property");
      // nextgen C-2542: the old spy asserting that C# never reopens the checker structuralMembers(input, destination,
      // "correspondence") relation is removed: the target has no checker relation to reopen; the published
      // correspondence vector is the only input (the fail-closed cases below tamper with it).
      observed = true;
      return compileCsharpAnalysisTarget(request, observer);
    } });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(observed, true);
    assert.equal(compiled.artifacts.get("src/Index.cs")?.includes("public struct Point"), true);
  });

  for (const mode of ["missing", "incomplete", "foreign-property", "foreign-origin", "duplicate"]) {
    test(`${mode} published struct member correspondence fails closed in ${surface}`, () => {
      let observed = 0;
      const compiled = compileCsharpSource({ surface, sourceText, compileTarget(request, observer) {
        const source = request.input.source;
        const point = selected(source, "Point");
        const foreign = selected(source, "Foreign");
        const replacement = mode === "missing" ? undefined : mode === "incomplete" ? []
          : mode === "foreign-property" ? [{ ...point.pair, property: foreign.property }]
          : mode === "foreign-origin" ? [{ ...point.pair, origin: foreign.pair.origin }]
          : [point.pair, point.pair];
        const values = { ...source.facts.values, type(node) {
          const outcome = source.facts.values.type(node);
          if (node !== point.node) return outcome;
          observed += 1;
          return { ...outcome, memberCorrespondence: replacement };
        } };
        return compileCsharpAnalysisTarget({ ...request, input: { ...request.input,
          source: { ...source, facts: { ...source.facts, values } } } }, observer);
      } });
      assert.equal(compiled.sourceDiagnosticsText, "", "the unchanged original program is checked-Source-valid");
      assert.equal(observed > 0, true, "the actual marked destination is demanded");
      assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error" && issue.source === "tsonic-csharp"), true,
        "no field name, equal shape or raw checked relation can replace the exact complete pair");
      assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true);
    });
  }
}
