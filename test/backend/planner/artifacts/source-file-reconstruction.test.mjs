import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planCsharpSourceFiles } from "../../../../dist/backend/planner/artifacts/source-files.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/printer.js";

const mutualTypeImportSource = {
  sourceText: `
    import type { Peer } from "./peer.js";
    export interface Root { peer: Peer; }
    export function fail(error: Error): void { throw error; }
  `,
  files: {
    "peer.ts": `
      import type { Root } from "./index.js";
      export interface Peer { root: Root; }
      export function failPeer(error: Error): void { throw error; }
    `,
  },
};

for (const surface of ["native", "js"]) {
  test(`mutual type imports retain both native contracts in ${surface}`, { timeout: 300_000 }, () => {
    const { program } = createSourceFixture(surface);
    const context = createCsharpPlanningContext(program);
    const diagnostics = [];
    const planned = planCsharpSourceFiles(context, diagnostics);
    assert.equal(diagnostics.length, 0);
    const artifacts = program.records.sourceArtifacts.get();
    for (const [owner, dependency] of [["source-file:/project/index.ts", "source-file:/project/peer.ts"],
      ["source-file:/project/peer.ts", "source-file:/project/index.ts"]]) {
      const selected = artifacts.find(artifact => artifact.owner === owner);
      assert.equal(selected !== undefined, true, "each checked source owner is admitted before planning");
      assert.equal(selected.dependencies.some(entry => entry.owner === dependency && entry.facet === "source-file-public-surface"), true);
    }
    const generated = planned.sourceFiles.map(source => printCsharpCompilationUnit(source.unit)).join("\n");
    assert.match(generated, /public interface Root\b/u);
    assert.match(generated, /public interface Peer\b/u);
    assert.match(generated, /\bPeer peer\b/u);
    assert.match(generated, /\bRoot root\b/u);
    assert.equal(generated.includes("__tsonic_module_init"), false);
  });

  test(`corrupted sealed throw evidence fails its invariant even with mutual imports in ${surface}`, { timeout: 300_000 }, () => {
    const { program, failures } = createSourceFixture(surface);
    for (const label of ["missing classification", "wrong operand"]) for (const failure of failures) {
      const changed = { ...program, records: { ...program.records,
        throwValue: { get: subject => subject !== failure.statement ? program.records.throwValue.get(subject)
          : label === "missing classification" ? undefined
          : { ...failure.classification, expression: program.source.ast.getSourceFile(failure.statement) } },
      } };
      const diagnostics = [];
      assert.throws(() => planCsharpSourceFiles(createCsharpPlanningContext(changed), diagnostics),
        error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT", label);
      assert.equal(diagnostics.length, 0, "invalid internal evidence is not relabelled as a source diagnostic");
    }
  });
}

function createSourceFixture(surface) {
  const compiled = compileCsharpSource({ ...mutualTypeImportSource, surface });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const ast = program.source.ast;
  const failures = program.records.sourceArtifacts.get().flatMap(({ sourceFile }) => ast.statements(sourceFile))
    .filter(node => ast.name(node) !== undefined && ["fail", "failPeer"].includes(ast.text(ast.name(node))))
    .map(declaration => {
      const statement = ast.statements(ast.body(declaration))[0];
      const classification = program.records.throwValue.get(statement);
      assert.equal(statement !== undefined && classification !== undefined && classification.targetCarrier !== undefined, true);
      return { statement, classification };
    });
  assert.equal(failures.length, 2);
  return { program, failures };
}

test("native source rendering reads one sealed inventory without late discovery", () => {
  const { program } = createSourceFixture("native");
  const original = program.records.sourceArtifacts.get();
  const render = () => {
    const context = createCsharpPlanningContext(program);
    assert.equal(Object.hasOwn(context, "artifacts"), false, "the removed backend discovery service cannot return");
    const diagnostics = [];
    const planned = planCsharpSourceFiles(context, diagnostics);
    assert.equal(diagnostics.length, 0);
    return planned.sourceFiles.map(source => printCsharpCompilationUnit(source.unit)).join("\n");
  };
  assert.equal(render(), render(), "a second planning context has identical native output");
  assert.equal(program.records.sourceArtifacts.get() === original, true, "rendering cannot strengthen source publication");
});
