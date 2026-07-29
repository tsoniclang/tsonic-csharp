import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";

const moduleSpecifier = "@tsonic/dotnet/System.js";

function createSystemProvider() {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    targetFramework: "net10.0",
  });
  return createDotnetSourceDeclarationProvider({
    provider,
    targetFramework: "net10.0",
  });
}

function systemRequestContext() {
  return {
    containingFile: "App.ts",
    resolutionMode: "import",
    importSlice: {
      moduleSpecifier,
      kind: "named",
      requestedExports: [
        { exportedName: "Console", kind: "value" },
        { exportedName: "Span", kind: "value" },
      ],
    },
  };
}

function getSystemModel(provider) {
  const resolution = provider.resolveModule(
    moduleSpecifier,
    systemRequestContext(),
  );
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = provider.getDeclarationModel(resolution);
  assert.equal(Array.isArray(model.exports), true, JSON.stringify(model));
  return model;
}

test(".NET declaration projection emits exact enum and overload-group surfaces", () => {
  const model = getSystemModel(createSystemProvider());
  assert.equal(
    validateDotnetProviderDeclarationModelContract(model),
    undefined,
  );

  const consoleColor = model.exports.find(
    (declaration) => declaration.name === "ConsoleColor",
  );
  assert.equal(consoleColor?.kind, "enum");
  assert.ok(consoleColor.members.length > 0);
  for (const member of consoleColor.members) {
    assert.deepEqual(
      Object.keys(member).sort(),
      ["id", "kind", "name"],
    );
  }

  const readOnlySpan = model.exports.find(
    (declaration) => declaration.name === "ReadOnlySpan",
  );
  const equalsMembers = readOnlySpan.members.filter(
    (member) => member.name === "Equals",
  );
  assert.equal(equalsMembers.length, 1);
  assert.equal(equalsMembers[0].static, undefined);
  assert.equal(equalsMembers[0].signatures.length, 2);
  assert.equal(
    new Set(equalsMembers[0].signatures.map((signature) => signature.id)).size,
    2,
  );
});

test(".NET declaration contract rejects enum field shape and duplicate source surfaces", () => {
  const diagnostic = validateDotnetProviderDeclarationModelContract({
    moduleSpecifier: "@tsonic/dotnet/Invalid.js",
    providerModuleId: "@tsonic/dotnet/Invalid.js",
    exports: [
      {
        id: "Invalid.Enum",
        name: "InvalidEnum",
        kind: "enum",
        members: [{
          id: "Invalid.Enum.Value",
          name: "Value",
          kind: "field",
          static: true,
          readonly: true,
          type: { kind: "number" },
        }],
      },
      {
        id: "Invalid.Surface",
        name: "InvalidSurface",
        kind: "class",
        members: [
          {
            id: "Invalid.Surface.first",
            name: "same",
            kind: "method",
            signatures: [{
              id: "Invalid.Surface.first()",
              parameters: [],
              returnType: { kind: "void" },
            }],
          },
          {
            id: "Invalid.Surface.second",
            name: "same",
            kind: "method",
            static: false,
            signatures: [{
              id: "Invalid.Surface.second()",
              parameters: [],
              returnType: { kind: "void" },
            }],
          },
        ],
      },
    ],
  });

  assert.equal(
    diagnostic?.code,
    "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID",
  );
  const paths = diagnostic.evidence.map((entry) => entry.path);
  assert.ok(paths.includes("$.exports[0].members[0].static"));
  assert.ok(paths.includes("$.exports[0].members[0].readonly"));
  assert.ok(paths.includes("$.exports[0].members[0].type"));
  assert.ok(paths.includes("$.exports[1].members[1].name"));
});
