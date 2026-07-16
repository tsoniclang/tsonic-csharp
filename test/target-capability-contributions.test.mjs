import assert from "node:assert/strict";
import test from "node:test";
import {
  createCsharpTargetCapabilityContributions,
  csharpDotnetProviderContributionKind,
  csharpProviderOperationsContributionKind,
  csharpTargetBindingsContributionKind,
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

  const contributions = createCsharpTargetCapabilityContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [capability],
    selectedSurfaces: [],
  });

  assert.deepEqual(contributions.providerOperations, [csharpContribution]);
  assert.deepEqual(contributions.dotnetProviders, []);
  assert.deepEqual(contributions.targetBindings, []);
});

test("C# snapshots exact capability target bindings with render metadata", () => {
  const binding = {
    id: "Acme.Native.Widget",
    sourceName: "Widget",
    targetName: "Acme.Native.Widget",
    target: "csharp",
    kind: "class",
    csharpType: {
      kind: "target-named",
      id: "Acme.Native.Widget",
      csharpRender: { kind: "named", namespace: ["Acme", "Native"], name: "Widget" },
    },
  };
  const capability = {
    id: "@acme/native",
    moduleOwnership: [{ specifierPrefix: "@acme/native/" }],
    createTargetContributions() {
      return [{ kind: csharpTargetBindingsContributionKind, bindings: [binding] }];
    },
  };

  const contributions = createCsharpTargetCapabilityContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [capability],
    selectedSurfaces: [],
  });

  binding.csharpType.csharpRender.name = "Mutated";
  assert.equal(contributions.targetBindings.length, 1);
  assert.equal(contributions.targetBindings[0].csharpType.csharpRender.name, "Widget");
  assert.equal(Object.isFrozen(contributions.targetBindings[0].csharpType.csharpRender), true);
});

test("C# rejects malformed or duplicate capability target bindings", () => {
  const binding = {
    id: "Acme.Native.Widget",
    sourceName: "Widget",
    targetName: "Acme.Native.Widget",
    target: "csharp",
    kind: "class",
    csharpType: {
      kind: "target-named",
      id: "Acme.Native.Other",
      csharpRender: { kind: "named", namespace: ["Acme", "Native"], name: "Widget" },
    },
  };
  const capability = {
    id: "@acme/native",
    moduleOwnership: [{ specifierPrefix: "@acme/native/" }],
    createTargetContributions() {
      return [{ kind: csharpTargetBindingsContributionKind, bindings: [binding] }];
    },
  };
  assert.throws(
    () => createCsharpTargetCapabilityContributions({
      project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
      target: { id: "csharp" },
      targetPack: { id: "csharp", displayName: "C#" },
      selectedCapabilities: [capability],
      selectedSurfaces: [],
    }),
    /invalid 'csharp-target-bindings' binding at index 0/,
  );
});

test("C# rejects malformed .NET provider reference directory URLs without semantic recovery", () => {
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
      return [{
        kind: csharpDotnetProviderContributionKind,
        providerIdentity: {
          id: "@acme/native",
          version: "1.0.0",
          target: "csharp",
          displayName: "Acme native provider",
        },
        moduleSpecifierPolicy: {
          packageName: "@acme/native",
          modulePrefix: "@acme/native/",
        },
        referenceDirectoryUrl: "not a URL",
        assemblySourcePackages: [{ assemblyName: "Acme.Native", packageName: "@acme/native" }],
      }];
    },
  };

  assert.throws(
    () => createCsharpTargetCapabilityContributions({
      project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
      target: { id: "csharp" },
      targetPack: { id: "csharp", displayName: "C#" },
      selectedCapabilities: [capability],
      selectedSurfaces: [],
    }),
    /supplied an invalid 'csharp-dotnet-provider' contribution/,
  );
});
