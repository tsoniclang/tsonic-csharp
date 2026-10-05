import assert from "node:assert/strict";
import test from "node:test";
import { createTargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import { captureDependencies } from "../../../../dist/backend/planner/artifacts/graph/dependencies.js";
import { reconstructCsharpSourceFiles } from "../../../../dist/backend/planner/artifacts/source-file-reconstruction.js";

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
