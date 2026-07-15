import assert from "node:assert/strict";
import test from "node:test";
import {
  createCsharpProviderOperationsContributions,
  csharpProviderOperationsContributionKind,
} from "../dist/source/csharp-source-semantics/provider-packages/index.js";

test("C# consumes only its target-owned contributions from the standard capability hook", () => {
  const csharpContribution = {
    kind: csharpProviderOperationsContributionKind,
    mapCheckedCall() {},
  };
  const capability = {
    id: "@acme/native",
    kind: "target-capability",
    targetId: "csharp",
    displayName: "Acme native capability",
    moduleOwnership: [{ specifierPrefix: "@acme/native/" }],
    createExtensions() {
      return [];
    },
    createTargetContributions() {
      return [
        { kind: "gpu-tensor-types", types: [] },
        csharpContribution,
      ];
    },
  };

  const contributions = createCsharpProviderOperationsContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [capability],
    selectedSurfaces: [],
  });

  assert.deepEqual(contributions, [csharpContribution]);
});
