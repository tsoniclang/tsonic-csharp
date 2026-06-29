import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetNativeArrayTypeId,
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";

const testAssemblyId = "Provider.Contract.Tests, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";

test(".NET provider model contract rejects legacy and incomplete provider refs", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Derived",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.Derived"),
        metadataName: "ProviderContractFixtures.Derived",
        baseType: {
          kind: "named",
          targetId: testTargetId("ProviderContractFixtures.Base"),
          metadataName: "ProviderContractFixtures.Base",
          sourceShape: {
            kind: "provider-ref",
            name: "Base",
          },
        },
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.moduleSpecifier"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.exportName"), true);
});

test(".NET provider model contract rejects malformed identities and type refs before conversion", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Box",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.Box"),
        metadataName: "ProviderContractFixtures.Box",
        members: [
          {
            kind: "method",
            sourceName: "broken",
            targetName: "Broken",
            targetId: testTargetId("ProviderContractFixtures.Box.Broken"),
            metadataName: "ProviderContractFixtures.Box.Broken",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.Box.Broken(System.Int32,System.String)"),
                parameters: [
                  {
                    name: "values",
                    type: { kind: "array", elementType: { kind: "source-primitive" } },
                    passingMode: "by-value",
                    rest: true,
                  },
                  {
                    name: "tail",
                    type: { kind: "type-parameter" },
                    passingMode: "not-a-mode",
                  },
                ],
                returnType: { kind: "source-primitive", name: "bool" },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].rest"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].type.elementType.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].passingMode"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].type.name"), true);
});

test(".NET provider declaration contract rejects provider refs missing public TSTS identity", () => {
  const diagnostic = validateDotnetProviderDeclarationModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    providerModuleId: "@tsonic/dotnet/ProviderContractFixtures.js",
    exports: [
      {
        id: testTargetId("ProviderContractFixtures.Derived"),
        name: "Derived",
        kind: "class",
        heritage: [
          {
            kind: "extends",
            type: {
              kind: "provider-ref",
              exportName: "Base",
            },
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].heritage[0].type.moduleSpecifier"), true);
});

test(".NET reflection provider emits contract-valid SDK metadata slices", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {
    requestedExports: ["Console", "CLSCompliantAttribute"],
  });
  const collectionsModule = provider.getModule("@tsonic/dotnet/System.Collections.Generic.js", {
    requestedExports: ["List", "Dictionary"],
  });

  assert.equal("exports" in systemModule, true, JSON.stringify(systemModule));
  assert.equal("exports" in collectionsModule, true, JSON.stringify(collectionsModule));
  assert.equal(validateDotnetModuleModelContract(systemModule), undefined);
  assert.equal(validateDotnetModuleModelContract(collectionsModule), undefined);

  const console = rawType(systemModule, "Console");
  assert.ok(rawMethod(console, "writeLine", "System.Console.WriteLine(System.String)"));
  assert.equal(rawMethod(console, "writeLine", "System.Console.WriteLine(System.String)").static, true);

  const clsCompliantAttribute = rawType(systemModule, "CLSCompliantAttribute");
  assert.deepEqual(clsCompliantAttribute.baseType.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    exportName: "Attribute",
  });
  assert.ok(rawConstructor(clsCompliantAttribute, "System.CLSCompliantAttribute..ctor(System.Boolean)"));

  const list = rawType(collectionsModule, "List");
  assert.deepEqual(list.typeParameters.map((parameter) => parameter.name), ["T"]);
  assert.ok(rawConstructor(list, "System.Collections.Generic.List`1..ctor()"));
  assert.ok(rawMethod(list, "add", "System.Collections.Generic.List`1.Add(T)"));

  const dictionary = rawType(collectionsModule, "Dictionary");
  assert.deepEqual(dictionary.typeParameters.map((parameter) => parameter.name), ["TKey", "TValue"]);
  assert.ok(rawMethod(dictionary, "add", "System.Collections.Generic.Dictionary`2.Add(TKey,TValue)"));
  assert.ok(rawIndexer(dictionary, "System.Collections.Generic.Dictionary`2.Item(TKey)"));
});

test(".NET target binding provider emits contract-valid virtual declaration models", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", {
    containingFile: "provider-contract.ts",
    requestedExports: ["Console", "CLSCompliantAttribute"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in model, true, JSON.stringify(model));
  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);
});

test(".NET target binding provider reports unsupported requested exports with provider evidence", () => {
  const bindingProvider = createDotnetTargetBindingProvider({
    provider: {
      identity: {
        id: "test.dotnet",
        version: "0.0.0",
        displayName: "Test .NET provider",
      },
      ownsModule() {
        return { kind: "owned" };
      },
      getModule() {
        return {
          moduleSpecifier: "@tsonic/dotnet/ProviderUnsupportedFixtures.js",
          namespaceName: "ProviderUnsupportedFixtures",
          exports: [],
          unsupportedExports: [
            {
              kind: "unsupported-type-export",
              sourceName: "PointerDelegate",
              targetId: testTargetId("ProviderUnsupportedFixtures.PointerDelegate"),
              metadataName: "ProviderUnsupportedFixtures.PointerDelegate",
              reason: "Delegate invoke signature contains pointer parameter System.Int32*.",
            },
          ],
        };
      },
    },
  });

  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/ProviderUnsupportedFixtures.js", {
    containingFile: "provider-unsupported.ts",
    requestedExports: ["PointerDelegate"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal(model.extensionCode, "DOTNET_PROVIDER_REQUESTED_EXPORT_UNSUPPORTED");
  assert.match(model.message, /PointerDelegate/u);
  assert.match(JSON.stringify(model.evidence), /pointer parameter/u);
});

test(".NET synthetic native array target binding is discoverable by provider target id", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const binding = provider.findTargetBindingByTargetId(dotnetNativeArrayTypeId);
  assert.ok(binding);
  assert.equal(binding.id, dotnetNativeArrayTypeId);
  assert.equal(binding.sourceName, "Array");
});

function testTargetId(metadataName) {
  return `${testAssemblyId}::${metadataName}`;
}

function hasEvidencePath(diagnostic, path) {
  return diagnostic?.evidence?.some((entry) => entry.path === path) === true;
}

function rawType(module, sourceName) {
  const declaration = module.exports.find((candidate) => candidate.kind === "type" && candidate.sourceName === sourceName);
  assert.ok(declaration, `Missing raw type ${sourceName}`);
  return declaration;
}

function rawMethod(type, sourceName, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.sourceName === sourceName &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing method ${type.sourceName}.${sourceName} with signature ${signatureShape}`);
  return member;
}

function rawConstructor(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "constructor" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing constructor ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

function rawIndexer(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "indexer" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing indexer ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

function idHasShape(id, metadataShape) {
  return stripAssemblyQualifiers(id) === metadataShape;
}

function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}
