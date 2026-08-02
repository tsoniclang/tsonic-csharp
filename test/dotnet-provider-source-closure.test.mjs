import assert from "node:assert/strict";
import test from "node:test";

import {
  sliceDotnetModuleExports,
} from "../dist/providers/dotnet/provider-slices.js";

test(".NET provider source closure excludes target-only metadata dependencies", () => {
  const moduleSpecifier = "@acme/dotnet/Example.js";
  const providerRef = (exportName) => ({
    kind: "provider-ref",
    moduleSpecifier,
    exportName,
  });
  const type = (sourceName, extra = {}) => ({
    kind: "type",
    typeKind: "class",
    sourceName,
    namespaceName: "Example",
    targetId: `Example::${sourceName}`,
    metadataName: `Example.${sourceName}`,
    ...extra,
  });
  const module = {
    moduleSpecifier,
    namespaceName: "Example",
    exports: [
      type("Root", {
        implementedContracts: [{ kind: "implements", contract: providerRef("TargetContract") }],
        members: [{
          kind: "method",
          sourceName: "Read",
          targetName: "Read",
          targetId: "Example::Root.Read",
          metadataName: "Example.Root.Read",
          targetDeclaringType: providerRef("TargetDeclaringType"),
          signatures: [{
            id: "Example::Root.Read()",
            sourceId: "Example::Root.Read()",
            parameters: [],
            returnType: {
              kind: "named",
              targetId: "Example::SourceDependency",
              metadataName: "Example.SourceDependency",
              sourceShape: providerRef("SourceDependency"),
            },
          }],
        }],
      }),
      type("SourceDependency"),
      type("TargetContract"),
      type("TargetDeclaringType"),
    ],
  };

  const sliced = sliceDotnetModuleExports(module, { requestedExports: ["Root"] });
  assert.deepEqual(
    sliced.exports.map((declaration) => declaration.sourceName),
    ["Root", "SourceDependency"],
  );
});
