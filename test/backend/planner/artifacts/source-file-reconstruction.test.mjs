import assert from "node:assert/strict";
import test from "node:test";
import { createTargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { captureDependencies } from "../../../../dist/backend/planner/artifacts/graph/dependencies.js";
import { reconstructCsharpSourceFiles } from "../../../../dist/backend/planner/artifacts/source-file-reconstruction.js";
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
    const reconstructed = reconstructCsharpSourceFiles(context, program.moduleInitialization, diagnostics);
    assert.equal(reconstructed !== undefined, true);
    assert.equal(diagnostics.length, 0);
    const { contractGraph } = context.artifacts;
    for (const [owner, dependency] of [
      ["source-file:/project/index.ts", "source-file:/project/peer.ts"],
      ["source-file:/project/peer.ts", "source-file:/project/index.ts"],
    ]) {
      assert.equal(contractGraph.hasPublishedFacet({ owner, facet: "source-file-implementation" }), true);
      assert.equal(contractGraph.hasPublishedFacet({ owner, facet: "source-file-public-surface" }), true);
      assert.equal(contractGraph.dependencies(owner).some(selected =>
        selected.owner === dependency && selected.facet === "source-file-public-surface"), true);
    }
    assert.equal(contractGraph.verifyClosure().kind, "closed");
    const generated = reconstructed.sourceFiles.map(source => printCsharpCompilationUnit(source.unit)).join("\n");
    assert.match(generated, /public interface Root\b/u);
    assert.match(generated, /public interface Peer\b/u);
    assert.match(generated, /\bPeer peer\b/u);
    assert.match(generated, /\bRoot root\b/u);
    assert.equal(generated.includes("__tsonic_module_init"), false);
  });

  test(`stable source failures are not hidden by unpublished mutual imports in ${surface}`, { timeout: 300_000 }, () => {
    const { program, failures } = createSourceFixture(surface);
    const dependenciesByOwner = new Map([
      ["source-file:/project/index.ts", { owner: "source-file:/project/peer.ts", facet: "source-file-public-surface" }],
      ["source-file:/project/peer.ts", { owner: "source-file:/project/index.ts", facet: "source-file-public-surface" }],
    ]);
    for (const label of ["missing classification", "wrong operand"]) {
      const mutations = new Map(failures.map(({ statement, classification }) => [statement,
        label === "missing classification" ? undefined
          : { ...classification, expression: program.source.ast.getSourceFile(statement) },
      ]));
      const changed = {
        ...program,
        operations: {
          ...program.operations,
          throwValue: subject => mutations.has(subject) ? mutations.get(subject) : program.operations.throwValue(subject),
        },
      };
      const context = createCsharpPlanningContext(changed);
      const captures = [];
      const capture = context.artifacts.captureDependencies;
      const input = {
        ...context,
        artifacts: {
          ...context.artifacts,
          captureDependencies(artifactOwner, dependencies, build) {
            const dependency = dependenciesByOwner.get(artifactOwner);
            const unpublishedImport = dependency !== undefined && !context.artifacts.contractGraph.hasPublishedFacet(dependency);
            const captured = capture(artifactOwner, dependencies, build);
            if (dependency !== undefined) captures.push({ owner: artifactOwner, stable: captured.stable, unpublishedImport,
              dependencyRetained: captured.dependencies.some(selected =>
                selected.owner === dependency.owner && selected.facet === dependency.facet) });
            return captured;
          },
        },
      };
      const diagnostics = [];
      const reconstructed = reconstructCsharpSourceFiles(input, changed.moduleInitialization, diagnostics);
      assert.equal(reconstructed === undefined, true, label);
      for (const owner of dependenciesByOwner.keys()) {
        assert.equal(captures.some(captured => captured.owner === owner && captured.stable && captured.unpublishedImport), true, label);
        assert.equal(context.artifacts.contractGraph.artifact(owner) === undefined, true, label);
      }
      assert.equal(captures.every(captured => captured.dependencyRetained), true, label);
      assert.equal(diagnostics.length, 2, label);
      for (const { classification } of failures) {
        const diagnostic = diagnostics.find(selected => selected.sourceNode === classification.expression);
        assert.equal(diagnostic !== undefined, true, label);
        assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST", label);
        assert.equal(diagnostic.message,
          "Throw expression has no exact sealed C# native error carrier classification.", label);
      }
      assert.equal(context.artifacts.contractGraph.artifact("generated-source-file:object-shapes") === undefined, true, label);
    }
  });
}

function createSourceFixture(surface) {
  const checked = checkCsharpSource({ ...mutualTypeImportSource, surface });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: {
      source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths,
    },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assert.equal(analysis.diagnostics.length, 0);
  const program = analysis.value;
  const failures = program.sourceFiles.flatMap(file => source.ast.statements(file))
    .filter(node => ["fail", "failPeer"].includes(source.ast.text(source.ast.name(node))))
    .map(declaration => {
      const statement = source.ast.statements(source.ast.body(declaration))[0];
      assert.equal(statement !== undefined, true);
      const classification = program.operations.throwValue(statement);
      assert.equal(classification !== undefined && classification.targetCarrier !== undefined, true);
      return { statement, classification };
    });
  assert.equal(failures.length, 2);
  return { program, failures };
}

for (const discovered of ["unrelated", "shape"]) {
  test(`synthetic source reconstruction follows ${discovered} discovery at its exact owner`, () => {
    const graph = createTargetArtifactContractGraph();
    const scope = { contracts: graph, dependencyCapture: { active: undefined } };
    const artifacts = [];
    let reads = 0;
    const input = {
      program: { sourceNavigation: { sourceFiles: [] }, captureStorage: { frames: [] } },
      artifacts: {
        contractGraph: graph,
        captureDependencies: (owner, dependencies, build) => captureDependencies(scope, owner, dependencies, build),
        objectShapeArtifacts() {
          reads += 1;
          if (reads === 3) {
            const owner = `discovered:${discovered}`;
            const committed = graph.commit(owner, { facets: discovered === "unrelated"
              ? [{ facet: "generated-helper-surface", value: "helper" }]
              : ["object-shape-type-surface", "object-shape-behavior", "object-shape-materialization"]
                .map(facet => ({ facet, value: "source" })),
            }, [], { kind: "discovered" });
            assert.equal(committed.kind, "accepted");
            if (discovered === "shape") artifacts.push({ key: owner, materialization: "source" });
          }
          return artifacts;
        },
        verifyContractClosure() {
          assert.equal(graph.hasPending(), false);
          assert.equal(graph.verifyClosure().kind, "closed");
          return { kind: "accepted" };
        },
      },
    };
    const diagnostics = [];
    const reconstructed = reconstructCsharpSourceFiles(input, {}, diagnostics);
    assert.equal(reconstructed !== undefined, true);
    assert.equal(diagnostics.length, 0);
    assert.equal(reads, discovered === "shape" ? 8 : 4,
      "only a changed synthetic inventory requires another native source construction");
  });
}
