import { readdirSync, readFileSync } from "node:fs";
import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, completeDotnetProviderContext, completeProviderDeclarationRequest, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

test(".NET reflection provider reloads requested export slices from persistent cache without rerunning reflection", () => {
  const cacheRoot = join(repoRoot, ".temp/provider-cache/dotnet-reflection-test-slices", `${Date.now()}-${process.pid}`);
  const populateTelemetry = createDotnetProviderTelemetry();
  const populateProvider = createDotnetReflectionTypeDataProvider({
    cacheRoot,
    telemetry: populateTelemetry,
  });
  const populated = getCompleteDotnetModule(populateProvider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in populated, true, JSON.stringify(populated));

  const cachedTelemetry = createDotnetProviderTelemetry();
  const cachedProvider = createDotnetReflectionTypeDataProvider({
    cacheRoot,
    telemetry: cachedTelemetry,
  });
  const cached = getCompleteDotnetModule(cachedProvider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in cached, true, JSON.stringify(cached));

  const snapshot = cachedProvider.getTelemetrySnapshot();
  const cachedRecords = readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => JSON.parse(readFileSync(join(cacheRoot, entry.name), "utf8")));
  const cachedModelBytes = cachedRecords.reduce((total, record) => total + JSON.stringify(record.model).length, 0);
  assert.equal(snapshot.toolInvocations, 0);
  assert.equal(snapshot.diskCacheHits, cachedRecords.length);
  assert.equal(snapshot.diskCacheMisses, 0);
  assert.equal(snapshot.memoryCacheMisses, cachedRecords.length);
  assert.equal(snapshot.modelBytes, cachedModelBytes);
  assert.equal(cached.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(cached.exports.some((declaration) => declaration.sourceName === "Console"), false);
});

test(".NET reflection provider keeps requested-export memory slices isolated from broad modules", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });
  const sliced = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in sliced, true, JSON.stringify(sliced));
  assert.equal(sliced.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(sliced.exports.some((declaration) => declaration.sourceName === "Console"), false);

  const broad = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {});
  assert.equal("exports" in broad, true, JSON.stringify(broad));
  assert.equal(broad.exports.some((declaration) => declaration.sourceName === "Console"), true);

  const slicedAgain = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in slicedAgain, true, JSON.stringify(slicedAgain));
  assert.equal(slicedAgain.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(slicedAgain.exports.some((declaration) => declaration.sourceName === "Console"), false);

  const snapshot = provider.getTelemetrySnapshot();
  assert.equal(snapshot.toolInvocations, 3);
  assert.equal(snapshot.memoryCacheMisses, 3);
  assert.equal(snapshot.memoryCacheHits, 2);
});

test(".NET reflection provider target-binding cache preserves member-complete bindings after virtual declaration slicing", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = { requestedExports: ["Exception"] };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", requestContext);
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));

  const model = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal("exports" in model, true, JSON.stringify(model));
  const exception = model.exports.find((declaration) => declaration.name === "Exception");
  assert.ok(exception);

  const binding = provider.findTargetBindingByMetadataName("System.Exception");
  assert.ok(binding);
  assert.equal(
    binding.members?.some((member) => member.id === `${binding.id}..ctor(System.Private.CoreLib, Version=10.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e::System.String)`),
    true,
  );
  assert.equal(
    binding.members?.some((member) => member.id === `${binding.id}.ToString()`),
    true,
  );
});

test(".NET provider declaration model omits source members without truthful source shapes", () => {
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/System.js",
    namespaceName: "System",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Example",
        namespaceName: "System",
        targetId: testTargetId("System.Example"),
        metadataName: "System.Example",
        members: [
          {
            kind: "property",
            sourceName: "unsafeTargetOnly",
            targetName: "UnsafeTargetOnly",
            targetId: testTargetId("System.Example.UnsafeTargetOnly"),
            metadataName: "System.Example.UnsafeTargetOnly",
            type: namedDotnetTypeRef("System.Environment.SpecialFolder"),
          },
          {
            kind: "property",
            sourceName: "safeString",
            targetName: "SafeString",
            targetId: testTargetId("System.Example.SafeString"),
            metadataName: "System.Example.SafeString",
            readable: true,
            writable: true,
            type: namedDotnetTypeRef("System.String", {
              sourceShape: { kind: "string" },
            }),
          },
          {
            kind: "method",
            sourceName: "unsafeMethod",
            targetName: "UnsafeMethod",
            targetId: testTargetId("System.Example.UnsafeMethod"),
            metadataName: "System.Example.UnsafeMethod",
            signatures: [
              {
                id: testTargetId("System.Example.UnsafeMethod(System.Environment.SpecialFolder)"),
                sourceId: testTargetId("System.Example.UnsafeMethod(System.Environment.SpecialFolder)"),
                parameters: [
                  {
                    name: "folder",
                    type: namedDotnetTypeRef("System.Environment.SpecialFolder"),
                    passingMode: "by-value",
                  },
                ],
                returnType: { kind: "void" },
              },
            ],
          },
        ],
      },
    ],
  });

  const example = model.exports[0];
  assert.deepEqual(example.members?.map((member) => member.name), ["safeString"]);
});

test(".NET provider model maps property setters and field mutability to source and target facts", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const example = {
    kind: "type",
    typeKind: "class",
    sourceName: "Example",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.Example"),
    metadataName: "ProviderModelFixtures.Example",
    members: [
      {
        kind: "property",
        sourceName: "mutableProperty",
        targetName: "MutableProperty",
        targetId: testTargetId("ProviderModelFixtures.Example.MutableProperty"),
        metadataName: "ProviderModelFixtures.Example.MutableProperty",
        readable: true,
        writable: true,
        type: int32,
      },
      {
        kind: "property",
        sourceName: "readonlyProperty",
        targetName: "ReadonlyProperty",
        targetId: testTargetId("ProviderModelFixtures.Example.ReadonlyProperty"),
        metadataName: "ProviderModelFixtures.Example.ReadonlyProperty",
        readable: true,
        type: int32,
      },
      {
        kind: "property",
        sourceName: "writeOnlyProperty",
        targetName: "WriteOnlyProperty",
        targetId: testTargetId("ProviderModelFixtures.Example.WriteOnlyProperty"),
        metadataName: "ProviderModelFixtures.Example.WriteOnlyProperty",
        readable: false,
        writable: true,
        type: int32,
      },
      {
        kind: "field",
        sourceName: "mutableField",
        targetName: "MutableField",
        targetId: testTargetId("ProviderModelFixtures.Example.MutableField"),
        metadataName: "ProviderModelFixtures.Example.MutableField",
        readable: true,
        writable: true,
        type: int32,
      },
      {
        kind: "field",
        sourceName: "readonlyField",
        targetName: "ReadonlyField",
        targetId: testTargetId("ProviderModelFixtures.Example.ReadonlyField"),
        metadataName: "ProviderModelFixtures.Example.ReadonlyField",
        readable: true,
        type: int32,
      },
    ],
  };

  const sourceModel = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    namespaceName: "ProviderModelFixtures",
    exports: [example],
  });
  const sourceExample = sourceModel.exports[0];
  const sourceMembers = new Map(sourceExample.members.map((member) => [member.name, member]));
  assert.equal(sourceMembers.get("mutableProperty").readonly, undefined);
  assert.equal(sourceMembers.get("readonlyProperty").readonly, true);
  assert.equal(sourceMembers.has("writeOnlyProperty"), false);
  assert.equal(sourceMembers.get("mutableField").readonly, undefined);
  assert.equal(sourceMembers.get("readonlyField").readonly, true);

  const targetBinding = dotnetExportToTargetBinding(example);
  const targetMembers = new Map(targetBinding.members.map((member) => [member.sourceName, member]));
  assert.equal(targetMembers.get("mutableProperty").readonly, undefined);
  assert.equal(targetMembers.get("readonlyProperty").readonly, true);
  assert.equal(targetMembers.get("writeOnlyProperty").readonly, undefined);
  assert.equal(targetMembers.get("mutableField").readonly, undefined);
  assert.equal(targetMembers.get("readonlyField").readonly, true);
});

test(".NET provider model keeps event facts target-only until source event semantics exist", () => {
  const eventHandler = namedDotnetTypeRef("System.EventHandler", {
    sourceShape: {
      kind: "function",
      id: "System.EventHandler.Invoke",
      parameters: [],
      returnType: { kind: "void" },
    },
  });
  const eventSource = {
    kind: "type",
    typeKind: "class",
    sourceName: "EventSource",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.EventSource"),
    metadataName: "ProviderModelFixtures.EventSource",
    members: [
      {
        kind: "event",
        sourceName: "changed",
        targetName: "Changed",
        targetId: testTargetId("ProviderModelFixtures.EventSource.Changed"),
        metadataName: "ProviderModelFixtures.EventSource.Changed",
        readable: false,
        writable: false,
        type: eventHandler,
      },
    ],
  };

  const sourceModel = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    namespaceName: "ProviderModelFixtures",
    exports: [eventSource],
  });
  assert.equal(sourceModel.exports[0].members?.some((member) => member.name === "changed") ?? false, false);

  const targetBinding = dotnetExportToTargetBinding(eventSource);
  const targetEvent = targetBinding.members.find((member) => member.kind === "event" && member.sourceName === "changed");
  assert.ok(targetEvent);
  assert.equal(targetEvent.targetName, "Changed");
  assert.deepEqual(targetEvent.parameters, []);
  assert.equal(targetEvent.returnType.kind, "target-named");
  assert.equal(idEndsWith(targetEvent.returnType.id, "System.EventHandler"), true);
});

test(".NET provider declaration model keeps inherited source members on heritage declarations", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const stringType = { kind: "string" };
  const baseType = {
    kind: "type",
    typeKind: "class",
    sourceName: "Base",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.Base"),
    metadataName: "ProviderModelFixtures.Base",
    members: [
      methodMember("ProviderModelFixtures.Base", "baseOnly", "BaseOnly", []),
      methodMember("ProviderModelFixtures.Base", "overloaded", "Overloaded", [
        { name: "text", type: stringType, passingMode: "by-value" },
      ]),
      {
        kind: "property",
        sourceName: "collision",
        targetName: "Collision",
        targetId: testTargetId("ProviderModelFixtures.Base.Collision"),
        metadataName: "ProviderModelFixtures.Base.Collision",
        readable: true,
        type: int32,
      },
    ],
  };
  const derivedType = {
    kind: "type",
    typeKind: "class",
    sourceName: "Derived",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.Derived"),
    metadataName: "ProviderModelFixtures.Derived",
    baseType: namedDotnetTypeRef("ProviderModelFixtures.Base", {
      sourceShape: {
        kind: "provider-ref",
        moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
        exportName: "Base",
      },
    }),
    members: [
      methodMember("ProviderModelFixtures.Derived", "ownOnly", "OwnOnly", []),
      methodMember("ProviderModelFixtures.Derived", "overloaded", "Overloaded", [
        { name: "count", type: int32, passingMode: "by-value" },
      ]),
      methodMember("ProviderModelFixtures.Derived", "collision", "Collision", []),
    ],
  };

  const sourceModel = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    namespaceName: "ProviderModelFixtures",
    exports: [baseType, derivedType],
  });
  const derived = sourceModel.exports.find((declaration) => declaration.name === "Derived");
  assert.ok(derived);
  const members = new Map(derived.members.map((member) => [member.name, member]));
  assert.deepEqual(derived.heritage, [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
      exportName: "Base",
    },
  }]);
  assert.equal(members.has("baseOnly"), false);
  assert.equal(members.has("ownOnly"), true);
  assert.equal(members.has("collision"), true);
  assert.equal(members.has("overloaded"), true);
  assert.deepEqual(members.get("overloaded").signatures.map((signature) =>
    signature.parameters.map((parameter) => parameter.type)), [[stringType], [int32]]);
});
