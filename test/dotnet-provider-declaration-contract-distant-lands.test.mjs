import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
  dotnetModuleToProviderDeclarationModel,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";
import { tryDotnetTypeRefToProviderType } from "../dist/providers/dotnet/model.js";
import { dotnetMembersToProviderMembers } from "../dist/providers/dotnet/declaration-model/members.js";

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

test("concrete properties suppress colliding extension-method projections", () => {
  const reflection = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    targetFramework: "net10.0",
  });
  const provider = createDotnetSourceDeclarationProvider({
    provider: reflection,
    targetFramework: "net10.0",
  });
  const linqModuleSpecifier = "@tsonic/dotnet/System.Linq.js";
  const resolution = provider.resolveModule(linqModuleSpecifier, {
    containingFile: "App.ts",
    resolutionMode: "import",
    importSlice: {
      moduleSpecifier: linqModuleSpecifier,
      kind: "named",
      requestedExports: [{ exportedName: "ILookup", kind: "type" }],
    },
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = provider.getDeclarationModel(resolution);
  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);
  const lookup = model.exports.find((declaration) =>
    declaration.name === "ILookup");
  const countMembers = lookup?.members?.filter((member) =>
    member.name === "Count") ?? [];
  assert.equal(countMembers.length, 1);
  assert.equal(countMembers[0].kind, "property");
});

test("enum source declarations omit extension-method projections", () => {
  const declaration = {
    kind: "type",
    typeKind: "enum",
    sourceName: "Status",
    namespaceName: "Example",
    targetId: "Example.Status",
    metadataName: "Example.Status",
  };
  const members = dotnetMembersToProviderMembers([{
    kind: "method",
    sourceName: "Describe",
    targetName: "Describe",
    targetId: "Example.StatusExtensions.Describe",
    metadataName: "Example.StatusExtensions.Describe",
    static: true,
    sourceStatic: false,
    sourceProjection: "extension-method",
    receiverPassing: "first-argument",
    sourceParameterOffset: 1,
    signatures: [{
      id: "Example.StatusExtensions.Describe(Example.Status)",
      sourceId: "Example.StatusExtensions.Describe(Example.Status)",
      parameters: [{
        name: "value",
        type: { kind: "provider-ref", moduleSpecifier, exportName: "Status" },
      }],
      returnType: { kind: "string" },
    }],
  }], declaration);

  assert.deepEqual(members, []);
});

test("concrete method call shapes precede extensions while distinct extension overloads remain", () => {
  const declaration = {
    kind: "type",
    typeKind: "class",
    sourceName: "Widget",
    namespaceName: "Example",
    targetId: "Example.Widget",
    metadataName: "Example.Widget",
  };
  const receiver = {
    name: "value",
    type: {
      kind: "named",
      targetId: "Example.Widget",
      metadataName: "Example.Widget",
      displayName: "Example.Widget",
      sourceShape: {
        kind: "provider-ref",
        moduleSpecifier,
        exportName: "Widget",
      },
    },
    passingMode: "by-value",
  };
  const members = dotnetMembersToProviderMembers([
    {
      kind: "method",
      sourceName: "Read",
      targetName: "Read",
      targetId: "Example.Widget.Read",
      metadataName: "Example.Widget.Read",
      signatures: [{
        id: "Example.Widget.Read()",
        sourceId: "Example.Widget.Read()",
        targetName: "Read",
        parameters: [],
        returnType: { kind: "string" },
      }],
    },
    {
      kind: "method",
      sourceName: "Read",
      targetName: "Read",
      targetId: "Example.WidgetExtensions.Read",
      metadataName: "Example.WidgetExtensions.Read",
      static: true,
      sourceStatic: false,
      sourceProjection: "extension-method",
      receiverPassing: "first-argument",
      sourceParameterOffset: 1,
      signatures: [
        {
          id: "Example.WidgetExtensions.Read(Example.Widget)",
          sourceId: "Example.WidgetExtensions.Read(Example.Widget)",
          targetName: "Read",
          parameters: [receiver],
          returnType: { kind: "source-primitive", name: "int32" },
        },
        {
          id: "Example.WidgetExtensions.Read(Example.Widget,System.Int32)",
          sourceId: "Example.WidgetExtensions.Read(Example.Widget,System.Int32)",
          targetName: "Read",
          parameters: [
            receiver,
            {
              name: "index",
              type: { kind: "source-primitive", name: "int32" },
              passingMode: "by-value",
            },
          ],
          returnType: { kind: "string" },
        },
      ],
    },
  ], declaration);

  assert.equal(members.length, 2);
  assert.deepEqual(
    members.flatMap((member) => member.signatures ?? []).map((signature) => ({
      parameterCount: signature.parameters.length,
      returnType: signature.returnType,
    })),
    [
      { parameterCount: 0, returnType: { kind: "string" } },
      { parameterCount: 1, returnType: { kind: "string" } },
    ],
  );
});

test("nullable .NET references project exact source undefined unions", () => {
  assert.deepEqual(
    tryDotnetTypeRefToProviderType({
      kind: "nullable-reference",
      elementType: { kind: "string" },
    }),
    {
      kind: "union",
      types: [{ kind: "string" }, { kind: "undefined" }],
    },
  );
  assert.deepEqual(
    tryDotnetTypeRefToProviderType({
      kind: "array",
      elementType: {
        kind: "nullable-reference",
        elementType: { kind: "string" },
      },
    }),
    {
      kind: "array",
      elementType: {
        kind: "union",
        types: [{ kind: "string" }, { kind: "undefined" }],
      },
    },
  );
});

test("derived provider signatures replace their exact virtual slot while retaining other inherited overloads", () => {
  const baseReadId = "Example.Base.Read()";
  const baseReadIntId = "Example.Base.Read(System.Int32)";
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@acme/contracts/Example.js",
    namespaceName: "Example",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Base",
        namespaceName: "Example",
        targetId: "Example.Base",
        metadataName: "Example.Base",
        members: [{
          kind: "method",
          sourceName: "Read",
          targetName: "Read",
          targetId: "Example.Base.Read",
          metadataName: "Example.Base.Read",
          signatures: [
            {
              id: baseReadId,
              sourceId: baseReadId,
              targetName: "Read",
              parameters: [],
              returnType: {
                kind: "nullable-reference",
                elementType: { kind: "string" },
              },
            },
            {
              id: baseReadIntId,
              sourceId: baseReadIntId,
              targetName: "Read",
              parameters: [{
                name: "index",
                type: { kind: "source-primitive", name: "int32" },
                passingMode: "by-value",
              }],
              returnType: {
                kind: "nullable-reference",
                elementType: { kind: "string" },
              },
            },
          ],
        }],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Derived",
        namespaceName: "Example",
        targetId: "Example.Derived",
        metadataName: "Example.Derived",
        baseType: {
          kind: "named",
          targetId: "Example.Base",
          metadataName: "Example.Base",
          displayName: "Example.Base",
          sourceShape: {
            kind: "provider-ref",
            moduleSpecifier: "@acme/contracts/Example.js",
            exportName: "Base",
          },
        },
        members: [{
          kind: "method",
          sourceName: "Read",
          targetName: "Read",
          targetId: "Example.Derived.Read",
          metadataName: "Example.Derived.Read",
          signatures: [
            {
              id: "Example.Derived.Read()",
              sourceId: baseReadId,
              targetName: "Read",
              parameters: [],
              returnType: { kind: "string" },
            },
            {
              id: "Example.Derived.Read(System.String)",
              sourceId: "Example.Derived.Read(System.String)",
              targetName: "Read",
              parameters: [{
                name: "key",
                type: { kind: "string" },
                passingMode: "by-value",
              }],
              returnType: { kind: "string" },
            },
          ],
        }],
      },
    ],
  });

  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);
  const read = model.exports
    .find((declaration) => declaration.name === "Derived")
    ?.members?.find((member) => member.name === "Read");
  assert.ok(read);
  assert.deepEqual(
    read.signatures.map((signature) => ({
      id: signature.id,
      returnType: signature.returnType,
    })),
    [
      {
        id: baseReadIntId,
        returnType: {
          kind: "union",
          types: [{ kind: "string" }, { kind: "undefined" }],
        },
      },
      { id: baseReadId, returnType: { kind: "string" } },
      {
        id: "Example.Derived.Read(System.String)",
        returnType: { kind: "string" },
      },
    ],
  );
});
