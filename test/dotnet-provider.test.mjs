import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  augmentDotnetModuleWithNativeArray,
  createDotnetProviderTelemetry,
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";
import {
  dotnetExportToTargetBinding,
  tryDotnetTypeRefToProviderType,
} from "../dist/providers/dotnet/model.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const testAssemblyId = "Test.Assembly, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";

function testTargetId(metadataName) {
  return `${testAssemblyId}::${metadataName}`;
}

function namedDotnetTypeRef(metadataName, options = {}) {
  return {
    kind: "named",
    targetId: testTargetId(metadataName),
    metadataName,
    displayName: metadataName,
    ...options,
  };
}

function methodMember(ownerMetadataName, sourceName, targetName, parameters, returnType = { kind: "void" }) {
  const signatureMetadataName = `${ownerMetadataName}.${targetName}(${parameters.map(dotnetTestTypeMetadataName).join(",")})`;
  return {
    kind: "method",
    sourceName,
    targetName,
    targetId: testTargetId(`${ownerMetadataName}.${targetName}`),
    metadataName: `${ownerMetadataName}.${targetName}`,
    signatures: [
      {
        id: testTargetId(signatureMetadataName),
        targetName,
        parameters,
        returnType,
      },
    ],
  };
}

function dotnetTestTypeMetadataName(parameter) {
  const type = "type" in parameter ? parameter.type : parameter;
  switch (type.kind) {
    case "string":
      return "System.String";
    case "source-primitive":
      return sourcePrimitiveTestMetadataName(type.name);
    case "type-parameter":
      return type.name;
    case "named":
      return type.metadataName;
    default:
      return type.kind;
  }
}

function sourcePrimitiveTestMetadataName(name) {
  switch (name) {
    case "int32":
      return "System.Int32";
    case "bool":
      return "System.Boolean";
    case "float64":
      return "System.Double";
    default:
      return name;
  }
}

function getDotnetDeclaration(provider, moduleSpecifier, metadataName) {
  const module = provider.getModule(moduleSpecifier, {});
  assert.equal("exports" in module, true, JSON.stringify(module));
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find((candidate) => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, `Missing .NET declaration '${metadataName}' in ${moduleSpecifier}`);
  return declaration;
}

function getDotnetTargetId(provider, moduleSpecifier, metadataName) {
  return getDotnetDeclaration(provider, moduleSpecifier, metadataName).targetId;
}

function getDotnetBinding(provider, moduleSpecifier, metadataName) {
  const targetId = getDotnetTargetId(provider, moduleSpecifier, metadataName);
  const binding = provider.findTargetBindingByTargetId(targetId);
  assert.ok(binding, `Missing .NET target binding '${targetId}'`);
  return binding;
}

function idEndsWith(id, metadataSuffix) {
  return stripAssemblyQualifiers(id) === metadataSuffix;
}

function findByIdSuffix(values, metadataSuffix) {
  return values.find((value) => typeof value.id === "string" && idEndsWith(value.id, metadataSuffix));
}

function stripAssemblyQualifiers(id) {
  return id
    .replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
      `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`)
    .replace(/\+/gu, ".");
}

function collectProviderRefs(value, predicate, refs = []) {
  if (value === null || typeof value !== "object") {
    return refs;
  }
  if (value.kind === "provider-ref" && predicate(value)) {
    refs.push(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectProviderRefs(item, predicate, refs);
    }
    return refs;
  }
  for (const nested of Object.values(value)) {
    collectProviderRefs(nested, predicate, refs);
  }
  return refs;
}

test(".NET provider declaration model preserves explicit target parameter passing modes", () => {
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/System.Collections.Generic.js",
    namespaceName: "System.Collections.Generic",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Dictionary",
        namespaceName: "System.Collections.Generic",
        targetId: testTargetId("System.Collections.Generic.Dictionary`2"),
        metadataName: "System.Collections.Generic.Dictionary`2",
        members: [
          {
            kind: "method",
            sourceName: "tryGetValue",
            targetName: "TryGetValue",
            targetId: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue"),
            metadataName: "System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)",
            signatures: [
              {
                id: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)"),
                parameters: [
                  {
                    name: "key",
                    type: { kind: "type-parameter", name: "TKey" },
                    passingMode: "by-value",
                  },
                  {
                    name: "value",
                    type: { kind: "type-parameter", name: "TValue" },
                    passingMode: "byref-writeonly-must-init",
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

  const dictionary = model.exports[0];
  const tryGetValue = dictionary.members[0];
  const signature = tryGetValue.signatures[0];

  assert.equal(signature.name, "TryGetValue");
  assert.equal(signature.parameters[0].passingMode, undefined);
  assert.equal(signature.parameters[1].passingMode, "byref-writeonly-must-init");
});

test(".NET provider exposes explicit native Array as a provider-owned C# array projection", () => {
  const module = augmentDotnetModuleWithNativeArray({
    moduleSpecifier: "@tsonic/dotnet/System.js",
    namespaceName: "System",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Array",
        namespaceName: "System",
        targetId: testTargetId("System.Array"),
        metadataName: "System.Array",
      },
    ],
  });
  const nativeArray = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Array"
  );
  assert.ok(nativeArray);
  assert.equal(nativeArray.targetId, dotnetNativeArrayTypeId);

  const model = dotnetModuleToProviderDeclarationModel(module);
  const providerArray = model.exports.find((declaration) => declaration.name === "Array" && declaration.kind === "class");
  assert.ok(providerArray);
  assert.equal(providerArray.id, dotnetNativeArrayTypeId);
  assert.deepEqual(providerArray.typeParameters, [{ name: "T", defaultType: { kind: "unknown" } }]);

  const create = providerArray.members.find((member) => member.name === "create");
  const length = providerArray.members.find((member) => member.name === "length");
  const indexer = providerArray.members.find((member) => member.kind === "indexer");
  assert.equal(create.id, dotnetNativeArrayCreateMemberId);
  assert.equal(create.static, true);
  assert.deepEqual(create.signatures[0].typeParameters, [{ name: "T" }]);
  assert.deepEqual(create.signatures[0].returnType, {
    kind: "provider-ref",
    name: "Array",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    typeArguments: [{ kind: "type-parameter", name: "T" }],
  });
  assert.equal(length.id, dotnetNativeArrayLengthMemberId);
  assert.equal(length.readonly, true);
  assert.equal(indexer.id, dotnetNativeArrayIndexerMemberId);
  assert.equal(indexer.readonly, undefined);

  const binding = dotnetExportToTargetBinding(nativeArray);
  assert.ok(binding);
  assert.equal(binding.csharpType.kind, "array");
  assert.equal(binding.csharpType.element.kind, "type-parameter");
  assert.equal(binding.members.find((member) => member.id === dotnetNativeArrayLengthMemberId).targetName, "Length");
  assert.equal(binding.members.find((member) => member.id === dotnetNativeArrayIndexerMemberId).targetName, "Item");
});

test(".NET reflection provider returns requested export declaration closures instead of whole namespaces", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const exportNames = module.exports.map((declaration) => declaration.sourceName).sort();
  assert.equal(exportNames.includes("Convert"), true);
  assert.equal(exportNames.includes("IFormatProvider"), true);
  assert.equal(exportNames.includes("Type"), true);
  assert.equal(exportNames.includes("SearchValues"), false);
  assert.equal(exportNames.includes("Console"), false);

  const convert = module.exports.find((declaration) => declaration.sourceName === "Convert");
  assert.ok(convert);
  assert.equal(convert.members?.some((member) => member.sourceName === "toByte"), true);

  const formatProvider = module.exports.find((declaration) => declaration.sourceName === "IFormatProvider");
  assert.ok(formatProvider);
  assert.equal(formatProvider.members, undefined);
});

test(".NET reflection provider reloads requested export slices from persistent cache without rerunning reflection", () => {
  const cacheRoot = join(repoRoot, ".temp/provider-cache/dotnet-reflection-test-slices");
  const populateTelemetry = createDotnetProviderTelemetry();
  const populateProvider = createDotnetReflectionTypeDataProvider({
    cacheRoot,
    telemetry: populateTelemetry,
  });
  const populated = populateProvider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in populated, true, JSON.stringify(populated));

  const cachedTelemetry = createDotnetProviderTelemetry();
  const cachedProvider = createDotnetReflectionTypeDataProvider({
    cacheRoot,
    telemetry: cachedTelemetry,
  });
  const cached = cachedProvider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in cached, true, JSON.stringify(cached));

  const snapshot = cachedProvider.getTelemetrySnapshot();
  assert.equal(snapshot.toolInvocations, 0);
  assert.equal(snapshot.diskCacheHits, 1);
  assert.equal(snapshot.diskCacheMisses, 0);
  assert.equal(snapshot.memoryCacheMisses, 1);
  assert.equal(snapshot.modelBytes < 1_000_000, true, JSON.stringify(snapshot));
  assert.equal(cached.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(cached.exports.some((declaration) => declaration.sourceName === "Console"), false);
});

test(".NET reflection provider keeps requested-export memory slices isolated from broad modules", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });
  const sliced = provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in sliced, true, JSON.stringify(sliced));
  assert.equal(sliced.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(sliced.exports.some((declaration) => declaration.sourceName === "Console"), false);

  const broad = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in broad, true, JSON.stringify(broad));
  assert.equal(broad.exports.some((declaration) => declaration.sourceName === "Console"), true);

  const slicedAgain = provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in slicedAgain, true, JSON.stringify(slicedAgain));
  assert.equal(slicedAgain.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(slicedAgain.exports.some((declaration) => declaration.sourceName === "Console"), false);

  const snapshot = provider.getTelemetrySnapshot();
  assert.equal(snapshot.toolInvocations, 2);
  assert.equal(snapshot.memoryCacheMisses, 2);
  assert.equal(snapshot.memoryCacheHits, 1);
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

test(".NET provider declaration model projects inherited source members deterministically", () => {
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
      sourceShape: { kind: "provider-ref", name: "Base" },
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
  assert.equal(members.has("baseOnly"), true);
  assert.equal(members.has("ownOnly"), true);
  assert.equal(members.has("collision"), false);
  assert.deepEqual(members.get("overloaded").signatures.map((signature) => signature.parameters.map((parameter) => parameter.name)), [
    ["text"],
    ["count"],
  ]);
});

test(".NET provider declaration model substitutes inherited generic type arguments without source-name lookup", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const baseType = {
    kind: "type",
    typeKind: "class",
    sourceName: "GenericBase",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.GenericBase`1"),
    metadataName: "ProviderModelFixtures.GenericBase`1",
    typeParameters: [{ name: "T" }],
    members: [
      {
        kind: "property",
        sourceName: "value",
        targetName: "Value",
        targetId: testTargetId("ProviderModelFixtures.GenericBase`1.Value"),
        metadataName: "ProviderModelFixtures.GenericBase`1.Value",
        readable: true,
        type: { kind: "type-parameter", name: "T" },
      },
      methodMember("ProviderModelFixtures.GenericBase`1", "echo", "Echo", [
        { name: "value", type: { kind: "type-parameter", name: "T" }, passingMode: "by-value" },
      ], { kind: "type-parameter", name: "T" }),
    ],
  };
  const derivedType = {
    kind: "type",
    typeKind: "class",
    sourceName: "IntDerived",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.IntDerived"),
    metadataName: "ProviderModelFixtures.IntDerived",
    baseType: namedDotnetTypeRef("ProviderModelFixtures.GenericBase`1", {
      typeArguments: [int32],
      sourceShape: {
        kind: "provider-ref",
        name: "GenericBase",
        typeArguments: [int32],
      },
    }),
  };

  const sourceModel = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    namespaceName: "ProviderModelFixtures",
    exports: [baseType, derivedType],
  });
  const derived = sourceModel.exports.find((declaration) => declaration.name === "IntDerived");
  assert.ok(derived);
  const value = derived.members.find((member) => member.kind === "property" && member.name === "value");
  const echo = derived.members.find((member) => member.kind === "method" && member.name === "echo");
  assert.deepEqual(value.type, int32);
  assert.deepEqual(echo.signatures[0].parameters[0].type, int32);
  assert.deepEqual(echo.signatures[0].returnType, int32);

  const targetBinding = dotnetExportToTargetBinding(derivedType);
  assert.deepEqual(targetBinding.csharpBaseType.typeArguments, [int32]);
});

test(".NET target refs do not promote any or unknown to CLR object", () => {
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "any" }), { kind: "opaque", id: "any" });
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "unknown" }), { kind: "opaque", id: "unknown" });
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "object" }), {
    kind: "target-named",
    id: "System.Object",
    csharpRender: { kind: "predefined", name: "object" },
  });
});

test(".NET explicit type-ref kinds carry special target semantics without metadata-name guessing", () => {
  const intType = { kind: "source-primitive", name: "int32" };

  const stringType = dotnetTypeRefToTargetTypeRef({ kind: "string" });
  assert.equal(stringType.csharpSpecialType, "string");
  assert.equal(stringType.csharpTypeofRuntimeKind, "string");

  const nullableType = dotnetTypeRefToTargetTypeRef({ kind: "nullable", elementType: intType });
  assert.equal(nullableType.csharpSpecialType, "nullable");
  assert.equal(nullableType.csharpValueType, true);
  assert.deepEqual(nullableType.typeArguments, [intType]);

  assert.deepEqual(dotnetTypeRefToProviderType({ kind: "nullable", elementType: intType }), {
    kind: "union",
    types: [intType, { kind: "literal", value: null }],
  });
});

test(".NET provider function source shapes preserve parameter modes and fail closed for unsupported parameter types", () => {
  const functionType = dotnetTypeRefToProviderType({
    kind: "function",
    parameters: [
      {
        name: "value",
        type: { kind: "source-primitive", name: "int32" },
        passingMode: "byref-writeonly-must-init",
      },
      {
        name: "label",
        type: { kind: "string" },
        passingMode: "by-value",
        optional: true,
      },
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  });

  assert.equal(functionType.kind, "function");
  assert.equal(functionType.parameters[0].passingMode, "byref-writeonly-must-init");
  assert.equal(functionType.parameters[1].passingMode, undefined);
  assert.equal(functionType.parameters[1].optional, true);

  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "function",
    parameters: [
      {
        name: "pointer",
        type: {
          kind: "pointer",
          pointee: { kind: "source-primitive", name: "int32" },
          mutability: "mut",
        },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "void" },
  }), undefined);
});

test(".NET provider source type conversion fails closed for every unsupported target-only type ref", () => {
  const intType = { kind: "source-primitive", name: "int32" };
  const pointerType = {
    kind: "pointer",
    pointee: intType,
    mutability: "mut",
  };

  assert.equal(tryDotnetTypeRefToProviderType(pointerType), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "function-pointer",
    args: [intType],
    result: { kind: "void" },
    abi: ["Cdecl"],
  }), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "array",
    rank: 2,
    elementType: intType,
  }), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "named",
    targetId: testTargetId("ProviderModelFixtures.PointerBacked"),
    metadataName: "ProviderModelFixtures.PointerBacked",
    sourceShape: pointerType,
  }), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "provider-ref",
    name: "Box",
    typeArguments: [pointerType],
  }), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "opaque",
    id: "ProviderModelFixtures.PointerOpaque",
    sourceShape: pointerType,
  }), undefined);
  assert.throws(
    () => dotnetTypeRefToProviderType(pointerType),
    /Unsupported \.NET provider type 'pointer'/u,
  );
});

test(".NET named target refs do not derive C# special semantics from metadata names", () => {
  const intType = { kind: "source-primitive", name: "int32" };
  const namedRefs = [
    dotnetTypeRefToTargetTypeRef(namedDotnetTypeRef("System.String")),
    dotnetTypeRefToTargetTypeRef(namedDotnetTypeRef("System.Void")),
    dotnetTypeRefToTargetTypeRef(namedDotnetTypeRef("System.Boolean")),
    dotnetTypeRefToTargetTypeRef(namedDotnetTypeRef("System.Numerics.BigInteger")),
    dotnetTypeRefToTargetTypeRef(namedDotnetTypeRef("System.Nullable`1", { typeArguments: [intType] })),
  ];

  for (const type of namedRefs) {
    assert.equal(type.csharpSpecialType, undefined);
    assert.equal(type.csharpTypeofRuntimeKind, undefined);
    assert.equal(type.csharpValueType, undefined);
  }
});

test(".NET target declarations do not derive C# special semantics from metadata names", () => {
  const stringBinding = dotnetExportToTargetBinding({
    kind: "type",
    typeKind: "class",
    sourceName: "String",
    namespaceName: "System",
    targetId: testTargetId("System.String"),
    metadataName: "System.String",
  });
  const booleanBinding = dotnetExportToTargetBinding({
    kind: "type",
    typeKind: "struct",
    sourceName: "Boolean",
    namespaceName: "System",
    targetId: testTargetId("System.Boolean"),
    metadataName: "System.Boolean",
  });

  assert.equal(stringBinding.csharpType.csharpSpecialType, undefined);
  assert.equal(stringBinding.csharpType.csharpTypeofRuntimeKind, undefined);
  assert.equal(stringBinding.csharpType.csharpValueType, undefined);
  assert.equal(booleanBinding.csharpType.csharpSpecialType, undefined);
  assert.equal(booleanBinding.csharpType.csharpTypeofRuntimeKind, undefined);
  assert.equal(booleanBinding.csharpType.csharpValueType, true);
});

test(".NET target refs carry provider-proven collection literal element metadata", () => {
  const raw = dotnetTypeRefToTargetTypeRef({
    kind: "named",
    targetId: testTargetId("System.Collections.Generic.IEnumerable`1"),
    metadataName: "System.Collections.Generic.IEnumerable`1",
    displayName: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
  });
  const providerProven = dotnetTypeRefToTargetTypeRef({
    kind: "named",
    targetId: testTargetId("System.Collections.Generic.IEnumerable`1"),
    metadataName: "System.Collections.Generic.IEnumerable`1",
    displayName: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
    sourceShape: {
      kind: "array",
      elementType: { kind: "source-primitive", name: "int32" },
    },
  });

  assert.equal(raw.csharpArrayLiteralElementType, undefined);
  assert.deepEqual(providerProven.csharpArrayLiteralElementType, { kind: "source-primitive", name: "int32" });
});

test(".NET target binding uses provider-owned target member names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Collections.Generic.js", "System.Collections.Generic.List`1");

  const count = binding.members.find((member) => member.sourceName === "count");
  const item = binding.members.find((member) => member.sourceName === "item");

  assert.equal(count?.targetName, "Count");
  assert.equal(item?.targetName, "Item");
});

test(".NET reflection provider records attribute facts as target data without source-visible fake semantics", () => {
  const reference = buildAttributeFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderAttributeFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawTarget = module.exports.find((declaration) => declaration.sourceName === "AttributeTarget");
  assert.ok(rawTarget);

  const typeAttribute = rawTarget.attributes?.find((attribute) =>
    attribute.target === "type" &&
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  assert.ok(typeAttribute);
  assert.equal(idEndsWith(typeAttribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])"), true);
  assert.deepEqual(typeAttribute.arguments?.map((argument) => argument.kind), [
    "constructor",
    "constructor",
    "constructor",
    "constructor",
    "constructor",
    "named",
    "named",
  ]);
  assert.deepEqual(typeAttribute.arguments?.[0], { kind: "constructor", value: { kind: "string", value: "type" } });
  assert.equal(typeAttribute.arguments?.[2]?.value.kind, "enum");
  assert.equal(typeAttribute.arguments?.[2]?.value.fieldName, "Fast");
  assert.equal(typeAttribute.arguments?.[3]?.value.kind, "type");
  assert.deepEqual(typeAttribute.arguments?.[4]?.value, {
    kind: "array",
    elements: [
      { kind: "source-primitive", name: "int32", value: "1" },
      { kind: "source-primitive", name: "int32", value: "2" },
    ],
  });
  assert.deepEqual(typeAttribute.arguments?.slice(5), [
    { kind: "named", name: "Enabled", memberKind: "property", value: { kind: "source-primitive", name: "bool", value: true } },
    { kind: "named", name: "Label", memberKind: "field", value: { kind: "string", value: "type-field" } },
  ]);

  const rawRun = rawTarget.members.find((member) => member.kind === "method" && member.sourceName === "run");
  assert.ok(rawRun);
  const runSignature = rawRun.signatures[0];
  const methodAttribute = runSignature.attributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  const returnAttribute = runSignature.returnAttributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  const methodParameterAttribute = runSignature.parameters[0].attributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  assert.equal(methodAttribute?.target, "method");
  assert.equal(returnAttribute?.target, "return");
  assert.equal(methodParameterAttribute?.target, "parameter");

  const rawConstructor = rawTarget.members.find((member) => member.kind === "constructor");
  assert.ok(rawConstructor);
  const constructorAttribute = rawConstructor.signatures[0].attributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  const constructorParameterAttribute = rawConstructor.signatures[0].parameters[0].attributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  assert.equal(constructorAttribute?.target, "constructor");
  assert.equal(constructorParameterAttribute?.target, "parameter");

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceTarget = declarationModel.exports.find((declaration) => declaration.name === "AttributeTarget");
  assert.ok(sourceTarget);
  assert.equal(JSON.stringify(sourceTarget).includes("SampleAttribute"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderAttributeFixtures.js", "ProviderAttributeFixtures.AttributeTarget");
  assert.equal(binding.attributes?.length, rawTarget.attributes?.length);
  const targetTypeAttribute = binding.attributes?.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])")
  );
  assert.ok(targetTypeAttribute);
  assert.equal(targetTypeAttribute.attributeType.kind, "target-named");
  assert.equal(idEndsWith(targetTypeAttribute.attributeType.id, "ProviderAttributeFixtures.SampleAttribute"), true);
  assert.deepEqual(targetTypeAttribute.arguments?.map((argument) => argument.kind), typeAttribute.arguments?.map((argument) => argument.kind));
  assert.deepEqual(targetTypeAttribute.arguments?.[0], typeAttribute.arguments?.[0]);
  assert.equal(targetTypeAttribute.arguments?.[2]?.value.kind, "enum");
  assert.equal(targetTypeAttribute.arguments?.[2]?.value.type.kind, "target-named");
  assert.equal(targetTypeAttribute.arguments?.[3]?.value.kind, "type");
  assert.equal(targetTypeAttribute.arguments?.[3]?.value.type.kind, "target-named");
  const targetRun = binding.members.find((member) => idEndsWith(member.id, "ProviderAttributeFixtures.AttributeTarget.Run(System.Int32)"));
  assert.ok(targetRun);
  assert.equal(targetRun.attributes?.some((attribute) => attribute.target === "method"), true);
  assert.equal(targetRun.returnAttributes?.some((attribute) => attribute.target === "return"), true);
  assert.equal(targetRun.parameters[0].attributes?.some((attribute) => attribute.target === "parameter"), true);

  const unsupportedTarget = module.exports.find((declaration) => declaration.sourceName === "UnsupportedAttributeTarget");
  assert.ok(unsupportedTarget);
  const unsupportedAttribute = unsupportedTarget.unsupportedAttributes?.find((attribute) =>
    /Type attribute value/u.test(attribute.reason)
  );
  assert.ok(unsupportedAttribute);
  assert.match(unsupportedAttribute.reason, /Type attribute value/u);
  assert.match(unsupportedAttribute.reason, /System\.Int32\*/u);
  const unsupportedBinding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderAttributeFixtures.js", "ProviderAttributeFixtures.UnsupportedAttributeTarget");
  const targetUnsupportedAttribute = unsupportedBinding.unsupportedAttributes?.find((attribute) =>
    /Type attribute value/u.test(attribute.reason)
  );
  assert.ok(targetUnsupportedAttribute);
  assert.equal(targetUnsupportedAttribute.reason, unsupportedAttribute.reason);
});

test(".NET target bindings preserve provider-proven extension-method receiver passing", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.Linq.js", {});
  assert.equal("exports" in module, true);

  const enumerable = module.exports.find((declaration) => declaration.sourceName === "Enumerable");
  assert.ok(enumerable);
  const rawAverage = enumerable.members.find((member) =>
    member.kind === "method" &&
    member.sourceName === "average" &&
    member.receiverPassing === "first-argument"
  );
  assert.ok(rawAverage);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Linq.js", "System.Linq.Enumerable");
  const average = binding.members.find((member) =>
    member.kind === "method" &&
    member.sourceName === "average" &&
    member.receiverPassing === "first-argument"
  );
  assert.ok(average);
  assert.equal(average.static, true);
  assert.equal(average.parameters[0].passingMode, "by-value");
});

test(".NET provider source declarations keep extension-method signature identities for explicit calls", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in module, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const memoryExtensions = declarationModel.exports.find((declaration) => declaration.name === "MemoryExtensions");
  assert.ok(memoryExtensions);

  const asSpan = memoryExtensions.members.find((member) =>
    member.kind === "method" &&
    member.name === "asSpan" &&
    member.static === true
  );
  assert.ok(asSpan);

  const signature = findByIdSuffix(asSpan.signatures, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.ok(signature);
  assert.equal(signature.name, "AsSpan");
  assert.deepEqual(signature.parameters.map((parameter) => parameter.name), ["text", "start"]);
  assert.deepEqual(signature.parameters[0].type, { kind: "string" });
  assert.deepEqual(signature.parameters[1].type, { kind: "source-primitive", name: "int32" });

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.MemoryExtensions");
  const targetMember = findByIdSuffix(binding.members, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.ok(targetMember);
  assert.equal(targetMember.receiverPassing, "first-argument");
});

test(".NET provider models LINQ ExtensionMethods receiver metadata from target facts", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.Linq.js", {});
  assert.equal("exports" in module, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const enumerable = declarationModel.exports.find((declaration) => declaration.name === "Enumerable");
  assert.ok(enumerable);
  const average = enumerable.members.find((member) =>
    member.kind === "method" &&
    member.name === "average" &&
    member.static === true
  );
  assert.ok(average);
  assert.ok(findByIdSuffix(average.signatures, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)"));

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Linq.js", "System.Linq.Enumerable");
  const targetAverage = findByIdSuffix(binding.members, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)");
  assert.ok(targetAverage);
  assert.equal(targetAverage.receiverPassing, "first-argument");
  assert.equal(targetAverage.parameters[0].passingMode, "by-value");
  assert.equal(targetAverage.returnType?.kind, "source-primitive");
  assert.equal(targetAverage.returnType?.kind === "source-primitive" ? targetAverage.returnType.name : undefined, "float64");
});

test(".NET provider model preserves overlap-like receiver and out parameter facts", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const typeParameter = { kind: "type-parameter", name: "T" };
  const spanOfT = {
    kind: "named",
    targetId: testTargetId("Example.Span`1"),
    metadataName: "Example.Span`1",
    displayName: "Example.Span`1",
    typeArguments: [typeParameter],
    sourceShape: { kind: "array", elementType: typeParameter },
  };
  const readOnlySpanOfT = {
    kind: "named",
    targetId: testTargetId("Example.ReadOnlySpan`1"),
    metadataName: "Example.ReadOnlySpan`1",
    displayName: "Example.ReadOnlySpan`1",
    typeArguments: [typeParameter],
    sourceShape: { kind: "array", elementType: typeParameter },
  };
  const overlaps = {
    kind: "type",
    typeKind: "class",
    sourceName: "MemoryExtensions",
    namespaceName: "Example",
    targetId: testTargetId("Example.MemoryExtensions"),
    metadataName: "Example.MemoryExtensions",
    members: [
      {
        kind: "method",
        sourceName: "overlaps",
        targetName: "Overlaps",
        targetId: testTargetId("Example.MemoryExtensions.Overlaps"),
        metadataName: "Example.MemoryExtensions.Overlaps",
        static: true,
        receiverPassing: "first-argument",
        signatures: [
          {
            id: testTargetId("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)"),
            typeParameters: [{ name: "T" }],
            parameters: [
              { name: "span", type: spanOfT, passingMode: "by-value" },
              { name: "other", type: readOnlySpanOfT, passingMode: "by-value" },
              { name: "elementOffset", type: int32, passingMode: "byref-writeonly-must-init" },
            ],
            returnType: { kind: "source-primitive", name: "bool" },
          },
        ],
      },
    ],
  };

  const declarationModel = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/Example.js",
    namespaceName: "Example",
    exports: [overlaps],
  });
  const sourceMemoryExtensions = declarationModel.exports[0];
  const sourceOverlaps = sourceMemoryExtensions.members[0];
  const sourceSignature = sourceOverlaps.signatures[0];

  assert.equal(sourceSignature.id, testTargetId("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)"));
  assert.equal(sourceSignature.parameters[2].passingMode, "byref-writeonly-must-init");

  const targetBinding = dotnetExportToTargetBinding(overlaps);
  const targetOverlaps = targetBinding.members[0];
  assert.equal(targetOverlaps.receiverPassing, "first-argument");
  assert.equal(targetOverlaps.parameters[2].passingMode, "byref-writeonly-must-init");
});

test(".NET target binding provider uses configured provider identity for diagnostics and virtual modules", () => {
  const identity = {
    id: "acme.dotnet.fixture-provider",
    version: "1.2.3",
    target: "csharp",
    displayName: "Acme .NET Fixture Provider",
  };
  const rejectedDiagnostic = {
    code: "DOTNET_FIXTURE_REJECTED",
    message: "Fixture provider rejected this module.",
    evidence: [{ module: "@tsonic/dotnet/System.js" }],
  };
  const bindingProvider = createDotnetTargetBindingProvider({
    provider: {
      identity,
      ownsModule(specifier) {
        return specifier === "@tsonic/dotnet/System.js"
          ? { kind: "rejected", diagnostic: rejectedDiagnostic }
          : { kind: "owned" };
      },
      getModule(specifier) {
        return {
          moduleSpecifier: specifier,
          namespaceName: "System.Text",
          exports: [],
        };
      },
    },
  });

  const ownership = bindingProvider.ownsModule("@tsonic/dotnet/System.js", {});
  assert.equal(ownership.kind, "reject");
  assert.equal(ownership.diagnostic.extensionId, identity.id);
  assert.equal(ownership.diagnostic.extensionCode, rejectedDiagnostic.code);
  assert.equal(ownership.diagnostic.message, rejectedDiagnostic.message);

  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.Text.js", { broadImport: true });
  assert.equal(resolution.kind, "virtual");
  assert.equal(resolution.providerModuleId, "@tsonic/dotnet/System.Text.js");
  assert.match(
    resolution.virtualFileName,
    /^tsts-provider:\/\/acme\.dotnet\.fixture-provider\/%40tsonic%2Fdotnet%2FSystem\.Text\.js\/broad\.d\.ts$/u,
  );
});

test(".NET reflection provider proves collection constructor array-literal element metadata", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Collections.Generic.js", "System.Collections.Generic.List`1");

  const collectionConstructor = binding.members.find((member) =>
    member.kind === "constructor" &&
    member.parameters[0]?.type.kind === "target-named" &&
    idEndsWith(member.parameters[0].type.id, "System.Collections.Generic.IEnumerable`1")
  );

  assert.ok(collectionConstructor);
  const parameterType = collectionConstructor.parameters[0].type;
  assert.equal(parameterType.kind, "target-named");
  assert.deepEqual(parameterType.csharpArrayLiteralElementType, { kind: "type-parameter", name: "T" });
});

test(".NET reflection provider preserves exact constructor facts and unsupported constructor evidence", () => {
  const reference = buildConstructorFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderConstructorFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawTarget = module.exports.find((declaration) => declaration.sourceName === "ConstructorTarget");
  assert.ok(rawTarget);
  const rawConstructors = rawTarget.members.filter((member) => member.kind === "constructor");
  assert.equal(rawConstructors.length, 6);
  const rawConstructorIds = rawConstructors.flatMap((member) => member.signatures?.map((signature) => stripAssemblyQualifiers(signature.id)) ?? []);
  assert.equal(rawConstructorIds.some((id) => id.includes("System.Decimal") || id.includes("System.Double")), false);

  const optionalConstructor = constructorSignature(rawTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(System.Int32,System.String)");
  assert.deepEqual(optionalConstructor.parameters.map((parameter) => parameter.name), ["value", "label"]);
  assert.equal(optionalConstructor.parameters[1].optional, true);
  assert.deepEqual(optionalConstructor.parameters[1].defaultValue, { kind: "string", value: "default" });

  const paramsConstructor = constructorSignature(rawTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(System.Int32[])");
  assert.equal(paramsConstructor.parameters[0].rest, true);
  assert.equal(paramsConstructor.parameters[0].type.kind, "array");

  assert.equal(
    constructorSignature(rawTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(ref System.Int64)")
      .parameters[0].passingMode,
    "byref-readwrite",
  );
  assert.equal(
    constructorSignature(rawTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(out System.Int16)")
      .parameters[0].passingMode,
    "byref-writeonly-must-init",
  );
  assert.equal(
    constructorSignature(rawTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(in System.Boolean,System.Char)")
      .parameters[0].passingMode,
    "byref-readonly",
  );

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceTarget = sourceModel.exports.find((declaration) => declaration.name === "ConstructorTarget");
  assert.ok(sourceTarget);
  const sourceConstructorIds = sourceTarget.members
    ?.filter((member) => member.kind === "constructor")
    .flatMap((member) => member.signatures?.map((signature) => stripAssemblyQualifiers(signature.id)) ?? []) ?? [];
  assert.equal(sourceConstructorIds.some((id) => id.includes("System.Decimal") || id.includes("System.Double")), false);
  const sourceOptionalConstructor = constructorSignature(sourceTarget, "ProviderConstructorFixtures.ConstructorTarget..ctor(System.Int32,System.String)");
  assert.equal(sourceOptionalConstructor.parameters[1].optional, true);
  assert.equal("defaultValue" in sourceOptionalConstructor.parameters[1], false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConstructorFixtures.js", "ProviderConstructorFixtures.ConstructorTarget");
  const targetOptionalConstructor = findByIdSuffix(binding.members, "ProviderConstructorFixtures.ConstructorTarget..ctor(System.Int32,System.String)");
  assert.ok(targetOptionalConstructor);
  const targetConstructorIds = binding.members
    ?.filter((member) => member.kind === "constructor")
    .map((member) => stripAssemblyQualifiers(member.id)) ?? [];
  assert.equal(targetConstructorIds.some((id) => id.includes("System.Decimal") || id.includes("System.Double")), false);
  assert.equal(targetOptionalConstructor.kind, "constructor");
  assert.equal(targetOptionalConstructor.targetName, ".ctor");
  assert.equal(stripAssemblyQualifiers(targetOptionalConstructor.overloadGroup), "ProviderConstructorFixtures.ConstructorTarget..ctor");
  assert.deepEqual(targetOptionalConstructor.parameters[1].defaultValue, { kind: "string", value: "default" });

  const unsupportedTarget = module.exports.find((declaration) => declaration.sourceName === "UnsupportedConstructorTarget");
  assert.ok(unsupportedTarget);
  const unsupportedConstructor = unsupportedMembersByMetadataName(unsupportedTarget)
    .get("ProviderConstructorFixtures.UnsupportedConstructorTarget..ctor(System.Int32*)");
  assert.ok(unsupportedConstructor);
  assert.match(unsupportedConstructor.reason, /parameter 'pointer'/u);
  assert.match(unsupportedConstructor.reason, /System\.Int32\*/u);

  const unsupportedBinding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConstructorFixtures.js", "ProviderConstructorFixtures.UnsupportedConstructorTarget");
  assert.equal(unsupportedBinding.members?.some((member) => member.kind === "constructor") ?? false, false);
  assert.deepEqual(unsupportedBinding.unsupportedMembers, unsupportedTarget.unsupportedMembers);
});

test(".NET reflection provider rejects unsupported target frameworks instead of drifting", () => {
  const provider = createDotnetReflectionTypeDataProvider({ targetFramework: "net9.0" });
  const module = provider.getModule("@tsonic/dotnet/System.js", {});

  assert.equal(module.code, "DOTNET_REFLECTION_TARGET_FRAMEWORK_UNSUPPORTED");
  assert.match(module.message, /target framework is not supported/);
  assert.match(JSON.stringify(module.evidence), /net10\.0/);
  assert.match(JSON.stringify(module.evidence), /net9\.0/);
});

test(".NET reflection provider rejects missing explicit references instead of silently omitting them", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    references: ["missing-reference-for-provider-test.dll"],
  });
  const module = provider.getModule("@tsonic/dotnet/System.js", {});

  assert.equal(module.code, "DOTNET_REFLECTION_PROVIDER_FAILED");
  assert.match(JSON.stringify(module.evidence), /missing-reference-for-provider-test\.dll/);
  assert.match(JSON.stringify(module.evidence), /does not exist/);
});

test(".NET reflection provider exposes contracts, operators, and nested public types", () => {
  const provider = createDotnetReflectionTypeDataProvider();

  const int32 = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Int32");
  assert.ok(int32.implementedContracts.some((contract) =>
    contract.kind === "implements" &&
    idEndsWith(contract.contract, "System.IEquatable`1") &&
    contract.typeArguments?.[0]?.kind === "source-primitive" &&
    contract.typeArguments[0].name === "int32"
  ));

  const dateTime = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.DateTime");
  assert.ok(dateTime.members.some((member) =>
    member.kind === "operator" &&
    member.sourceName === "addition" &&
    member.targetName === "op_Addition"
  ));

  const specialFolder = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Environment.SpecialFolder");
  assert.equal(specialFolder.kind, "enum");
  assert.ok(specialFolder.members.some((member) =>
    member.kind === "field" &&
    member.static === true &&
    member.sourceName === "desktop" &&
    member.targetName === "Desktop"
  ));

  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  assert.ok(systemModule.exports.some((declaration) =>
    declaration.sourceName === "SpecialFolder" &&
    declaration.metadataName === "System.Environment.SpecialFolder"
  ));
});

test(".NET reflection provider records events as target facts and omits source declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.Diagnostics.js", {});
  assert.equal("exports" in module, true);

  const rawProcess = module.exports.find((declaration) => declaration.sourceName === "Process");
  assert.ok(rawProcess);
  const rawExited = rawProcess.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "exited" &&
    member.targetName === "Exited"
  );
  assert.ok(rawExited);
  assert.equal(rawExited.metadataName, "System.Diagnostics.Process.Exited");
  assert.equal(rawExited.type.kind, "named");
  assert.equal(rawExited.type.metadataName, "System.EventHandler");
  assert.equal(rawExited.type.sourceShape?.kind, "function");
  const unsupportedExited = rawProcess.unsupportedMembers?.find((member) =>
    member.kind === "unsupported-member" &&
    member.memberKind === "event" &&
    member.metadataName === "System.Diagnostics.Process.Exited"
  );
  assert.ok(unsupportedExited);
  assert.match(unsupportedExited.reason, /add\/remove subscription semantics/);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const process = declarationModel.exports.find((declaration) => declaration.name === "Process");
  assert.ok(process);
  assert.equal(process.members?.some((member) => member.name === "exited"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Diagnostics.js", "System.Diagnostics.Process");
  const targetExited = binding.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "exited" &&
    member.targetName === "Exited"
  );
  assert.ok(targetExited);
  assert.deepEqual(targetExited.parameters, []);
  assert.equal(targetExited.returnType.kind, "target-named");
  assert.equal(idEndsWith(targetExited.returnType.id, "System.EventHandler"), true);
});

test(".NET reflection provider records unsupported source events without dropping target facts", () => {
  const reference = buildUnsupportedEventFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderEventFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawEventSource = module.exports.find((declaration) => declaration.sourceName === "EventSource");
  assert.ok(rawEventSource);
  const rawPointerEvent = rawEventSource.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "pointerEvent" &&
    member.targetName === "PointerEvent"
  );
  assert.ok(rawPointerEvent);
  assert.equal(rawPointerEvent.type.kind, "named");
  assert.equal(rawPointerEvent.type.metadataName, "ProviderEventFixtures.PointerEventHandler");
  assert.equal(rawPointerEvent.type.sourceShape, undefined);

  const unsupportedPointerEvent = rawEventSource.unsupportedMembers?.find((member) =>
    member.kind === "unsupported-member" &&
    member.memberKind === "event" &&
    member.metadataName === "ProviderEventFixtures.EventSource.PointerEvent"
  );
  assert.ok(unsupportedPointerEvent);
  assert.match(unsupportedPointerEvent.reason, /add\/remove subscription semantics/);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const eventSource = declarationModel.exports.find((declaration) => declaration.name === "EventSource");
  assert.ok(eventSource);
  assert.equal(eventSource.members?.some((member) => member.name === "pointerEvent"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderEventFixtures.js", "ProviderEventFixtures.EventSource");
  const targetPointerEvent = binding.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "pointerEvent" &&
    member.targetName === "PointerEvent"
  );
  assert.ok(targetPointerEvent);
  assert.equal(targetPointerEvent.returnType.kind, "target-named");
  assert.equal(idEndsWith(targetPointerEvent.returnType.id, "ProviderEventFixtures.PointerEventHandler"), true);
});

test(".NET reflection provider exposes readable source properties with readonly facts", () => {
  const provider = createDotnetReflectionTypeDataProvider();

  const textModule = provider.getModule("@tsonic/dotnet/System.Text.js", {});
  assert.equal("exports" in textModule, true);
  const rawStringBuilder = textModule.exports.find((declaration) => declaration.sourceName === "StringBuilder");
  assert.ok(rawStringBuilder);
  const rawLength = rawStringBuilder.members.find((member) =>
    member.kind === "property" &&
    member.sourceName === "length" &&
    member.targetName === "Length"
  );
  assert.ok(rawLength);
  assert.equal(rawLength.static, undefined);
  assert.equal(rawLength.readable, true);
  assert.equal(rawLength.writable, true);
  assert.deepEqual(rawLength.type, { kind: "source-primitive", name: "int32" });

  const textDeclarationModel = dotnetModuleToProviderDeclarationModel(textModule);
  const sourceStringBuilder = textDeclarationModel.exports.find((declaration) => declaration.name === "StringBuilder");
  assert.ok(sourceStringBuilder);
  const sourceLength = sourceStringBuilder.members.find((member) =>
    member.kind === "property" &&
    member.name === "length" &&
    member.static === undefined
  );
  assert.ok(sourceLength);
  assert.equal(sourceLength.readonly, undefined);

  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  const rawConsole = systemModule.exports.find((declaration) => declaration.sourceName === "Console");
  assert.ok(rawConsole);
  const foregroundColor = rawConsole.members.find((member) =>
    member.kind === "property" &&
    member.sourceName === "foregroundColor" &&
    member.targetName === "ForegroundColor"
  );
  assert.ok(foregroundColor);
  assert.equal(foregroundColor.static, true);
  assert.equal(foregroundColor.readable, true);
  assert.equal(foregroundColor.writable, true);

  const rawEnvironment = systemModule.exports.find((declaration) => declaration.sourceName === "Environment");
  assert.ok(rawEnvironment);
  assert.equal(rawEnvironment.members?.some((member) => member.targetName === "NewLine") ?? false, true);
  assert.equal(rawEnvironment.unsupportedMembers?.some((member) => member.targetName === "NewLine") ?? false, false);
  const systemDeclarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const sourceEnvironment = systemDeclarationModel.exports.find((declaration) => declaration.name === "Environment");
  assert.ok(sourceEnvironment);
  const sourceNewLine = sourceEnvironment.members?.find((member) => member.name === "newLine");
  assert.ok(sourceNewLine);
  assert.equal(sourceNewLine.readonly, true);
});

test(".NET reflection provider exposes readable fields with readonly facts", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const rawDateTime = systemModule.exports.find((declaration) => declaration.sourceName === "DateTime");
  assert.ok(rawDateTime);
  assert.equal(rawDateTime.members?.some((member) => member.targetName === "MinValue") ?? false, true);
  const systemDeclarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const sourceDateTime = systemDeclarationModel.exports.find((declaration) => declaration.name === "DateTime");
  assert.ok(sourceDateTime);
  const sourceMinValue = sourceDateTime.members?.find((member) => member.name === "minValue");
  assert.ok(sourceMinValue);
  assert.equal(sourceMinValue.readonly, true);

  const specialFolder = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Environment.SpecialFolder");
  assert.equal(specialFolder.kind, "enum");
  assert.ok(specialFolder.members.some((member) =>
    member.kind === "field" &&
    member.static === true &&
    member.sourceName === "desktop" &&
    member.targetName === "Desktop"
  ));
});

test(".NET reflection provider exposes unique nested CLR types as source declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const rawEnvironment = systemModule.exports.find((declaration) => declaration.sourceName === "Environment");
  assert.ok(rawEnvironment);
  assert.ok(rawEnvironment.members.some((member) => member.sourceName === "getFolderPath"));

  const declarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const environment = declarationModel.exports.find((declaration) => declaration.name === "Environment");
  assert.ok(environment);
  assert.equal(environment.members.some((member) => member.name === "getFolderPath"), true);
  assert.equal(environment.members.some((member) => member.name === "newLine"), true);
  const specialFolder = declarationModel.exports.find((declaration) => declaration.name === "SpecialFolder");
  assert.ok(specialFolder);
  assert.equal(specialFolder.kind, "enum");
  assert.equal(specialFolder.members.some((member) => member.name === "desktop"), true);

  assert.ok(getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Environment.SpecialFolder"));
});

test(".NET reflection provider target identities preserve nested CLR separators instead of collapsing with namespace names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const specialFolder = systemModule.exports.find((declaration) =>
    declaration.sourceName === "SpecialFolder" &&
    declaration.metadataName === "System.Environment.SpecialFolder"
  );
  assert.ok(specialFolder);
  assert.match(specialFolder.targetId, /::System\.Environment\+SpecialFolder$/u);

  const binding = provider.findTargetBindingByTargetId(specialFolder.targetId);
  assert.ok(binding);
  assert.equal(binding.id, specialFolder.targetId);
  assert.equal(provider.findTargetBindingByTargetId(specialFolder.targetId.replace("Environment+SpecialFolder", "Environment.SpecialFolder")), undefined);
});

test(".NET reflection provider preserves cross-namespace source-visible provider refs", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const ioModule = provider.getModule("@tsonic/dotnet/System.IO.js", {});
  assert.equal("exports" in ioModule, true);

  const binaryReader = ioModule.exports.find((declaration) => declaration.sourceName === "BinaryReader");
  assert.ok(binaryReader);
  const encodingConstructor = binaryReader.members.find((member) =>
    member.kind === "constructor" &&
    member.signatures.some((signature) => idEndsWith(signature.id, "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)"))
  );
  assert.ok(encodingConstructor);
  const encodingParameter = encodingConstructor.signatures
    .find((signature) => idEndsWith(signature.id, "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)"))
    ?.parameters.find((parameter) => parameter.name === "encoding");
  assert.deepEqual(encodingParameter?.type.sourceShape, {
    kind: "provider-ref",
    name: "Encoding",
    moduleSpecifier: "@tsonic/dotnet/System.Text.js",
  });

  const declarationModel = dotnetModuleToProviderDeclarationModel(ioModule);
  const sourceBinaryReader = declarationModel.exports.find((declaration) => declaration.name === "BinaryReader");
  assert.ok(sourceBinaryReader);
  const sourceEncodingConstructor = sourceBinaryReader.members.find((member) =>
    member.kind === "constructor" &&
    member.signatures.some((signature) => idEndsWith(signature.id, "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)"))
  );
  assert.ok(sourceEncodingConstructor);
  const sourceEncodingParameter = sourceEncodingConstructor.signatures
    .find((signature) => idEndsWith(signature.id, "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)"))
    ?.parameters.find((parameter) => parameter.name === "encoding");
  assert.deepEqual(sourceEncodingParameter?.type.sourceShape, {
    kind: "provider-ref",
    name: "Encoding",
    moduleSpecifier: "@tsonic/dotnet/System.Text.js",
  });

  const rawMemoryStream = ioModule.exports.find((declaration) => declaration.sourceName === "MemoryStream");
  assert.deepEqual(rawMemoryStream?.baseType?.sourceShape, {
    kind: "provider-ref",
    name: "Stream",
  });
  const sourceMemoryStream = declarationModel.exports.find((declaration) => declaration.name === "MemoryStream");
  assert.deepEqual(sourceMemoryStream?.extends, [{
    kind: "provider-ref",
    name: "Stream",
    moduleSpecifier: "@tsonic/dotnet/System.IO.js",
  }]);

  const tasksModule = provider.getModule("@tsonic/dotnet/System.Threading.Tasks.js", {});
  assert.equal("exports" in tasksModule, true);
  const rawTaskCanceled = tasksModule.exports.find((declaration) => declaration.sourceName === "TaskCanceledException");
  assert.ok(rawTaskCanceled);
  assert.deepEqual(rawTaskCanceled.baseType?.sourceShape, {
    kind: "provider-ref",
    name: "OperationCanceledException",
    moduleSpecifier: "@tsonic/dotnet/System.js",
  });
  const tasksDeclarationModel = dotnetModuleToProviderDeclarationModel(tasksModule);
  const sourceTaskCanceled = tasksDeclarationModel.exports.find((declaration) => declaration.name === "TaskCanceledException");
  assert.deepEqual(sourceTaskCanceled?.extends, [{
    kind: "provider-ref",
    name: "OperationCanceledException",
    moduleSpecifier: "@tsonic/dotnet/System.js",
  }]);
});

test(".NET provider source declarations project cross-module inherited overloads", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const reflectionModule = provider.getModule("@tsonic/dotnet/System.Reflection.js", {});
  assert.equal("exports" in reflectionModule, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(reflectionModule, {
    resolveModule(specifier) {
      const module = provider.getModule(specifier, {});
      return "exports" in module ? module : undefined;
    },
  });
  const typeDelegator = declarationModel.exports.find((declaration) => declaration.name === "TypeDelegator");
  assert.ok(typeDelegator);
  const getConstructors = typeDelegator.members?.find((member) => member.kind === "method" && member.name === "getConstructors");
  assert.ok(getConstructors);
  assert.equal(getConstructors.signatures?.some((signature) => signature.parameters.length === 0), true);
  assert.equal(getConstructors.signatures?.some((signature) => signature.parameters.length === 1), true);

  const getEvent = typeDelegator.members?.find((member) => member.kind === "method" && member.name === "getEvent");
  assert.ok(getEvent);
  assert.equal(getEvent.signatures?.some((signature) => signature.parameters.length === 1), true);
  assert.equal(getEvent.signatures?.some((signature) => signature.parameters.length === 2), true);

  const getNestedType = typeDelegator.members?.find((member) => member.kind === "method" && member.name === "getNestedType");
  assert.ok(getNestedType);
  assert.equal(getNestedType.signatures?.every((signature) =>
    signature.returnType?.kind === "target-named" &&
    signature.returnType.sourceShape?.kind === "provider-ref" &&
    signature.returnType.sourceShape.name === "Type" &&
    signature.returnType.sourceShape.moduleSpecifier === "@tsonic/dotnet/System.js"
  ), true);
});

test(".NET provider keeps target generic constraints out of source virtual declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const buffersModule = provider.getModule("@tsonic/dotnet/System.Buffers.js", {});
  assert.equal("exports" in buffersModule, true);

  const rawSequenceReader = buffersModule.exports.find((declaration) => declaration.sourceName === "SequenceReader");
  assert.ok(rawSequenceReader);
  assert.ok(rawSequenceReader.typeParameters?.[0]?.constraints?.some((constraint) => constraint.kind === "implements"));

  const declarationModel = dotnetModuleToProviderDeclarationModel(buffersModule);
  const sequenceReader = declarationModel.exports.find((declaration) => declaration.name === "SequenceReader");
  assert.ok(sequenceReader);
  assert.equal(sequenceReader.typeParameters?.[0]?.constraints, undefined);
});

test(".NET reflection provider records generic constraints and variance as target facts", () => {
  const reference = buildConstraintFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderConstraintFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawReferenceNewTarget = module.exports.find((declaration) => declaration.sourceName === "ReferenceNewTarget");
  assert.ok(rawReferenceNewTarget);
  const rawReferenceParameter = rawReferenceNewTarget.typeParameters?.[0];
  assert.ok(rawReferenceParameter);
  assert.deepEqual(rawReferenceParameter.constraints?.map((constraint) => constraint.kind), [
    "reference-type",
    "constructible",
    "implements",
  ]);
  const taggedConstraint = rawReferenceParameter.constraints.find((constraint) => constraint.kind === "implements");
  assert.equal(idEndsWith(taggedConstraint.contract.targetId, "ProviderConstraintFixtures.ITagged"), true);

  const copy = rawReferenceNewTarget.members.find((member) => member.kind === "method" && member.targetName === "Copy");
  assert.ok(copy);
  const copyTypeParameter = copy.signatures[0].typeParameters[0];
  assert.deepEqual(copyTypeParameter.constraints?.map((constraint) => constraint.kind), [
    "constructible",
    "implements",
    "implements",
  ]);
  assert.ok(copyTypeParameter.constraints.some((constraint) =>
    constraint.kind === "implements" &&
    idEndsWith(constraint.contract.targetId, "ProviderConstraintFixtures.EntityBase")
  ));
  assert.ok(copyTypeParameter.constraints.some((constraint) =>
    constraint.kind === "implements" &&
    idEndsWith(constraint.contract.targetId, "ProviderConstraintFixtures.ITagged")
  ));

  const rawStructTarget = module.exports.find((declaration) => declaration.sourceName === "StructTarget");
  assert.ok(rawStructTarget);
  assert.deepEqual(rawStructTarget.typeParameters?.[0]?.constraints?.map((constraint) => constraint.kind), [
    "value-type",
    "constructible",
  ]);

  const rawUnmanagedTarget = module.exports.find((declaration) => declaration.sourceName === "UnmanagedTarget");
  assert.ok(rawUnmanagedTarget);
  assert.deepEqual(rawUnmanagedTarget.typeParameters?.[0]?.constraints?.map((constraint) => constraint.kind), [
    "unmanaged",
  ]);

  const rawNotNullTarget = module.exports.find((declaration) => declaration.sourceName === "NotNullTarget");
  assert.ok(rawNotNullTarget);
  assert.deepEqual(rawNotNullTarget.typeParameters?.[0]?.constraints, [{ kind: "not-null" }]);

  const rawProducer = module.exports.find((declaration) => declaration.sourceName === "IProducer");
  assert.ok(rawProducer);
  assert.equal(rawProducer.typeParameters?.[0]?.variance, "out");
  const rawConsumer = module.exports.find((declaration) => declaration.sourceName === "IConsumer");
  assert.ok(rawConsumer);
  assert.equal(rawConsumer.typeParameters?.[0]?.variance, "in");

  const referenceBinding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConstraintFixtures.js", "ProviderConstraintFixtures.ReferenceNewTarget`1");
  assert.deepEqual(referenceBinding.typeParameters[0].constraints.map((constraint) => constraint.kind), [
    "reference-type",
    "constructible",
    "implements",
  ]);
  const copyTargetMember = referenceBinding.members.find((member) => idEndsWith(member.id, "ProviderConstraintFixtures.ReferenceNewTarget`1.Copy``1(TMethod)"));
  assert.ok(copyTargetMember);
  assert.deepEqual(copyTargetMember.typeParameters[0].constraints.map((constraint) => constraint.kind), [
    "constructible",
    "implements",
    "implements",
  ]);
  const notNullBinding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConstraintFixtures.js", "ProviderConstraintFixtures.NotNullTarget`1");
  assert.deepEqual(notNullBinding.typeParameters[0].constraints, [{
    kind: "target-specific",
    target: "csharp",
    name: "notnull",
  }]);
  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceReferenceNewTarget = declarationModel.exports.find((declaration) => declaration.name === "ReferenceNewTarget");
  assert.ok(sourceReferenceNewTarget);
  assert.deepEqual(sourceReferenceNewTarget.typeParameters?.map((parameter) => ({
    name: parameter.name,
    constraints: parameter.constraints,
  })), [{ name: "T", constraints: undefined }]);
  const sourceCopy = sourceReferenceNewTarget.members.find((member) => member.kind === "method" && member.name === "copy");
  assert.ok(sourceCopy);
  assert.equal(sourceCopy.signatures[0].typeParameters[0].constraints, undefined);
  const sourceNotNullTarget = declarationModel.exports.find((declaration) => declaration.name === "NotNullTarget");
  assert.ok(sourceNotNullTarget);
  assert.deepEqual(sourceNotNullTarget.typeParameters?.map((parameter) => ({
    name: parameter.name,
    constraints: parameter.constraints,
  })), [{ name: "T", constraints: undefined }]);
  const sourceProducer = declarationModel.exports.find((declaration) => declaration.name === "IProducer");
  assert.ok(sourceProducer);
  assert.deepEqual(sourceProducer.typeParameters, [{ name: "T", variance: "out" }]);
});

test(".NET reflection provider records conversion operators as target-only facts", () => {
  const reference = buildConversionFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderConversionFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawMeter = module.exports.find((declaration) => declaration.sourceName === "Meter");
  assert.ok(rawMeter);
  assert.equal(rawMeter.members.some((member) => member.kind === "operator"), false);
  const rawOperators = rawMeter.conversionOperators;
  assert.deepEqual(rawOperators.map((operator) => [
    operator.targetName,
    stripAssemblyQualifiers(operator.id),
    operator.conversionKind,
    operator.sourceType.kind,
    operator.targetType.kind,
  ]), [
    ["op_Explicit", "ProviderConversionFixtures.Meter.op_Explicit(System.Double)", "explicit", "source-primitive", "named"],
    ["op_Implicit", "ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)", "implicit", "named", "source-primitive"],
  ]);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceMeter = declarationModel.exports.find((declaration) => declaration.name === "Meter");
  assert.ok(sourceMeter);
  assert.equal(sourceMeter.members?.some((member) => member.name === "explicit" || member.name === "implicit") ?? false, false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConversionFixtures.js", "ProviderConversionFixtures.Meter");
  assert.equal(binding.members.some((member) => member.kind === "operator"), false);
  const targetOperators = binding.conversionOperators;
  assert.deepEqual(targetOperators.map((operator) => [
    stripAssemblyQualifiers(operator.id),
    operator.conversionKind,
    operator.sourceType.kind,
    operator.targetType.kind,
  ]), [
    ["ProviderConversionFixtures.Meter.op_Explicit(System.Double)", "explicit", "source-primitive", "target-named"],
    ["ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)", "implicit", "target-named", "source-primitive"],
  ]);

  const rawPointerSourceConversion = module.exports.find((declaration) => declaration.sourceName === "PointerSourceConversion");
  assert.ok(rawPointerSourceConversion);
  assert.equal(rawPointerSourceConversion.conversionOperators?.length ?? 0, 0);
  assert.equal(rawPointerSourceConversion.members?.some((member) => member.kind === "operator") ?? false, false);
  assert.ok([...unsupportedMembersByMetadataName(rawPointerSourceConversion).values()].some((member) =>
    member.memberKind === "operator" &&
    member.targetName === "op_Explicit" &&
    /parameter 'value'/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  const pointerSourceConversionBinding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderConversionFixtures.js", "ProviderConversionFixtures.PointerSourceConversion");
  assert.equal(pointerSourceConversionBinding.conversionOperators?.length ?? 0, 0);
  assert.deepEqual(pointerSourceConversionBinding.unsupportedMembers, rawPointerSourceConversion.unsupportedMembers);
});

test(".NET provider source declarations expose readonly TS-compatible string indexers", () => {
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@example/headers.js",
    namespaceName: "Example",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Headers",
        namespaceName: "Example",
        targetId: testTargetId("Example.Headers"),
        metadataName: "Example.Headers",
        members: [
          {
            kind: "indexer",
            sourceName: "item",
            targetName: "Item",
            targetId: testTargetId("Example.Headers.Item(System.String)"),
            metadataName: "Example.Headers.Item(System.String)",
            readable: true,
            writable: false,
            signatures: [
              {
                id: testTargetId("Example.Headers.Item(System.String)"),
                targetName: "Item",
                parameters: [
                  { name: "name", type: { kind: "string" } },
                ],
                returnType: { kind: "string" },
              },
            ],
          },
        ],
      },
    ],
  });

  const headers = model.exports.find((declaration) => declaration.name === "Headers");
  assert.ok(headers);
  const indexers = headers.members.filter((member) => member.kind === "indexer");
  assert.equal(indexers.length, 1);
  assert.equal(indexers[0].readonly, true);
  assert.deepEqual(indexers[0].signatures[0].parameters[0].type, { kind: "string" });
  assert.deepEqual(indexers[0].signatures[0].returnType, { kind: "string" });
});

test(".NET provider source declarations keep TS-compatible numeric and string indexers", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const specializedModule = provider.getModule("@tsonic/dotnet/System.Collections.Specialized.js", {});
  assert.equal("exports" in specializedModule, true);

  const rawNameValueCollection = specializedModule.exports.find((declaration) => declaration.sourceName === "NameValueCollection");
  assert.ok(rawNameValueCollection);
  const rawIndexers = rawNameValueCollection.members.filter((member) => member.kind === "indexer");
  assert.equal(rawIndexers.length, 2);

  const declarationModel = dotnetModuleToProviderDeclarationModel(specializedModule);
  const nameValueCollection = declarationModel.exports.find((declaration) => declaration.name === "NameValueCollection");
  assert.ok(nameValueCollection);
  const indexers = nameValueCollection.members.filter((member) => member.kind === "indexer");
  assert.equal(indexers.length, 2);
  assert.equal(indexers.some((member) =>
    member.signatures[0].parameters[0].type.kind === "string"
  ), true);
  assert.equal(indexers.some((member) =>
    member.signatures[0].parameters[0].type.kind === "source-primitive" &&
    member.signatures[0].parameters[0].type.name === "int32"
  ), true);
  for (const indexer of indexers) {
    const raw = rawIndexers.find((member) =>
      JSON.stringify(member.signatures[0].parameters[0].type) === JSON.stringify(indexer.signatures[0].parameters[0].type)
    );
    assert.ok(raw);
    assert.equal(indexer.readonly, raw.writable === true ? undefined : true);
  }
});

test(".NET target bindings retain generic Dictionary indexers as target-only facts", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const collectionsModule = provider.getModule("@tsonic/dotnet/System.Collections.Generic.js", {});
  assert.equal("exports" in collectionsModule, true);

  const rawDictionary = collectionsModule.exports.find((declaration) => declaration.sourceName === "Dictionary");
  assert.ok(rawDictionary);
  const rawIndexers = rawDictionary.members.filter((member) => member.kind === "indexer");
  assert.equal(rawIndexers.length, 1);
  assert.equal(rawIndexers[0].targetName, "Item");
  assert.deepEqual(rawIndexers[0].signatures[0].parameters[0].type, { kind: "type-parameter", name: "TKey" });

  const sourceModel = dotnetModuleToProviderDeclarationModel(collectionsModule);
  const sourceDictionary = sourceModel.exports.find((declaration) => declaration.name === "Dictionary");
  assert.ok(sourceDictionary);
  assert.equal(sourceDictionary.members.some((member) => member.kind === "indexer"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Collections.Generic.js", "System.Collections.Generic.Dictionary`2");
  const targetIndexers = binding.members.filter((member) => member.kind === "indexer");
  assert.equal(targetIndexers.length, 1);
  assert.deepEqual(targetIndexers[0].parameters[0].type, { kind: "type-parameter", name: "TKey" });
});

test(".NET provider source declarations omit constructor-named non-constructor members", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const reflectionModule = provider.getModule("@tsonic/dotnet/System.Reflection.js", {});
  assert.equal("exports" in reflectionModule, true);

  const rawCustomAttributeData = reflectionModule.exports.find((declaration) => declaration.sourceName === "CustomAttributeData");
  assert.ok(rawCustomAttributeData);
  assert.ok(rawCustomAttributeData.members.some((member) =>
    member.kind === "property" &&
    member.sourceName === "constructor" &&
    member.targetName === "Constructor"
  ));

  const declarationModel = dotnetModuleToProviderDeclarationModel(reflectionModule);
  const customAttributeData = declarationModel.exports.find((declaration) => declaration.name === "CustomAttributeData");
  assert.ok(customAttributeData);
  assert.equal(customAttributeData.members.some((member) => member.kind !== "constructor" && member.name === "constructor"), false);
});

test(".NET provider inheritance keeps provider refs in their owning virtual module", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const reflectionModule = provider.getModule("@tsonic/dotnet/System.Reflection.js", {});
  assert.equal("exports" in reflectionModule, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(reflectionModule, {
    resolveModule(specifier) {
      const module = provider.getModule(specifier, {});
      return "exports" in module ? module : undefined;
    },
  });
  const badRefs = collectProviderRefs(
    declarationModel,
    (ref) =>
      (ref.name === "CustomAttributeData" || ref.name === "MemberInfo") &&
      ref.moduleSpecifier === "@tsonic/dotnet/System.js",
  );

  assert.deepEqual(badRefs, []);
});

test(".NET provider source declarations omit signatures that reference unexportable provider refs", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const threadingModule = provider.getModule("@tsonic/dotnet/System.Threading.js", {});
  assert.equal("exports" in threadingModule, true);

  const rawPreAllocatedOverlapped = threadingModule.exports.find((declaration) => declaration.sourceName === "PreAllocatedOverlapped");
  assert.ok(rawPreAllocatedOverlapped);
  assert.match(JSON.stringify(rawPreAllocatedOverlapped), /IOCompletionCallback/);

  const declarationModel = dotnetModuleToProviderDeclarationModel(threadingModule);
  const preAllocatedOverlapped = declarationModel.exports.find((declaration) => declaration.name === "PreAllocatedOverlapped");
  assert.ok(preAllocatedOverlapped);
  assert.doesNotMatch(JSON.stringify(preAllocatedOverlapped), /IOCompletionCallback/);
});

test(".NET reflection provider exposes delegates with source shells and target delegate identity", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  const declarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const predicate = declarationModel.exports.find((declaration) => declaration.name === "Predicate");
  assert.ok(predicate);
  assert.equal(predicate.kind, "class");
  assert.deepEqual(predicate.typeParameters?.map((parameter) => parameter.name), ["T"]);
  assert.equal(predicate.type?.kind, "function");
  assert.deepEqual(predicate.type?.kind === "function"
    ? predicate.type.parameters.map((parameter) => [parameter.name, parameter.type])
    : [], [["obj", { kind: "type-parameter", name: "T" }]]);
  assert.deepEqual(predicate.type?.kind === "function" ? predicate.type.returnType : undefined, {
    kind: "source-primitive",
    name: "bool",
  });

  const targetBinding = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Predicate`1");
  assert.equal(targetBinding?.kind, "delegate");
  assert.equal(targetBinding?.csharpType.kind, "target-named");
  assert.equal(targetBinding?.csharpType.kind === "target-named" ? idEndsWith(targetBinding.csharpType.id, "System.Predicate`1") : false, true);
});

test(".NET reflection provider signature ids preserve byref modes and generic method arity", () => {
  const reference = buildSignatureIdentityFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderSignatureFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawTarget = module.exports.find((declaration) => declaration.sourceName === "SignatureTarget");
  assert.ok(rawTarget);
  const rawMembers = new Map(rawTarget.members.map((member) => [member.targetName, member]));
  const mSignatures = rawMembers.get("M").signatures;
  assert.deepEqual(mSignatures.map((signature) => stripAssemblyQualifiers(signature.id)), [
    "ProviderSignatureFixtures.SignatureTarget.M(System.Int32)",
    "ProviderSignatureFixtures.SignatureTarget.M(ref System.Int32)",
  ]);
  assert.deepEqual(mSignatures.map((signature) => signature.parameters[0].passingMode), [
    "by-value",
    "byref-readwrite",
  ]);

  const writeOut = rawMembers.get("WriteOut").signatures[0];
  assert.equal(idEndsWith(writeOut.id, "ProviderSignatureFixtures.SignatureTarget.WriteOut(out System.Int32)"), true);
  assert.equal(writeOut.parameters[0].passingMode, "byref-writeonly-must-init");

  const readIn = rawMembers.get("ReadIn").signatures[0];
  assert.equal(idEndsWith(readIn.id, "ProviderSignatureFixtures.SignatureTarget.ReadIn(in System.Int32)"), true);
  assert.equal(readIn.parameters[0].passingMode, "byref-readonly");

  const genericSignatures = rawMembers.get("Generic").signatures;
  assert.deepEqual(genericSignatures.map((signature) => stripAssemblyQualifiers(signature.id)), [
    "ProviderSignatureFixtures.SignatureTarget.Generic()",
    "ProviderSignatureFixtures.SignatureTarget.Generic``1()",
    "ProviderSignatureFixtures.SignatureTarget.Generic``2()",
  ]);
  assert.deepEqual(genericSignatures.map((signature) => signature.typeParameters?.length ?? 0), [0, 1, 2]);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderSignatureFixtures.js", "ProviderSignatureFixtures.SignatureTarget");
  assert.ok(binding.members.some((member) => idEndsWith(member.id, "ProviderSignatureFixtures.SignatureTarget.M(ref System.Int32)")));
  assert.ok(binding.members.some((member) => idEndsWith(member.id, "ProviderSignatureFixtures.SignatureTarget.Generic``2()")));
});

test(".NET reflection provider preserves selected parameter-mode facts per signature identity", () => {
  const reference = buildSignatureIdentityFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderSignatureFixtures.js", {});
  assert.equal("exports" in module, true);

  const optionalDefaultsId =
    "ProviderSignatureFixtures.ParameterModeTarget.OptionalDefaults(System.String,System.Int32,ProviderSignatureFixtures.SignatureMode,System.String)";
  const paramsRestId = "ProviderSignatureFixtures.ParameterModeTarget.ParamsRest(System.String,System.Int32[])";
  const byRefModesId =
    "ProviderSignatureFixtures.ParameterModeTarget.ByRefModes(ref System.Int32,out System.Boolean,in System.Int64)";

  const rawTarget = module.exports.find((declaration) => declaration.sourceName === "ParameterModeTarget");
  assert.ok(rawTarget);
  const rawOptionalDefaults = methodSignature(rawTarget, "OptionalDefaults", optionalDefaultsId);
  const rawParamsRest = methodSignature(rawTarget, "ParamsRest", paramsRestId);
  const rawByRefModes = methodSignature(rawTarget, "ByRefModes", byRefModesId);

  assert.equal(stripAssemblyQualifiers(rawOptionalDefaults.id), optionalDefaultsId);
  assert.deepEqual(parameterFacts(rawOptionalDefaults.parameters), [
    { name: "required", type: { kind: "string" }, passingMode: "by-value" },
    {
      name: "count",
      type: { kind: "source-primitive", name: "int32" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "source-primitive", name: "int32", value: "7" },
    },
    {
      name: "mode",
      type: { kind: "named", metadataName: "ProviderSignatureFixtures.SignatureMode" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "enum", value: "2", fieldName: "Enabled" },
    },
    {
      name: "label",
      type: { kind: "string" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "null" },
    },
  ]);
  assert.equal(stripAssemblyQualifiers(rawParamsRest.id), paramsRestId);
  assert.deepEqual(parameterFacts(rawParamsRest.parameters), [
    { name: "label", type: { kind: "string" }, passingMode: "by-value" },
    {
      name: "values",
      type: { kind: "array", element: { kind: "source-primitive", name: "int32" } },
      passingMode: "by-value",
      rest: true,
    },
  ]);
  assert.equal(stripAssemblyQualifiers(rawByRefModes.id), byRefModesId);
  assert.deepEqual(parameterFacts(rawByRefModes.parameters), [
    { name: "current", type: { kind: "source-primitive", name: "int32" }, passingMode: "byref-readwrite" },
    { name: "assigned", type: { kind: "source-primitive", name: "bool" }, passingMode: "byref-writeonly-must-init" },
    { name: "snapshot", type: { kind: "source-primitive", name: "int64" }, passingMode: "byref-readonly" },
  ]);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceTarget = sourceModel.exports.find((declaration) => declaration.name === "ParameterModeTarget");
  assert.ok(sourceTarget);
  const sourceOptionalDefaults = methodSignature(sourceTarget, "optionalDefaults", optionalDefaultsId);
  const sourceParamsRest = methodSignature(sourceTarget, "paramsRest", paramsRestId);
  const sourceByRefModes = methodSignature(sourceTarget, "byRefModes", byRefModesId);
  assert.equal(sourceOptionalDefaults.name, "OptionalDefaults");
  assert.deepEqual(parameterFacts(sourceOptionalDefaults.parameters), [
    { name: "required", type: { kind: "string" } },
    { name: "count", type: { kind: "source-primitive", name: "int32" }, optional: true },
    { name: "mode", type: { kind: "target-named", id: "ProviderSignatureFixtures.SignatureMode" }, optional: true },
    { name: "label", type: { kind: "string" }, optional: true },
  ]);
  assert.equal(sourceParamsRest.name, "ParamsRest");
  assert.deepEqual(parameterFacts(sourceParamsRest.parameters), [
    { name: "label", type: { kind: "string" } },
    { name: "values", type: { kind: "array", element: { kind: "source-primitive", name: "int32" } }, rest: true },
  ]);
  assert.equal(sourceByRefModes.name, "ByRefModes");
  assert.deepEqual(parameterFacts(sourceByRefModes.parameters), [
    { name: "current", type: { kind: "source-primitive", name: "int32" }, passingMode: "byref-readwrite" },
    { name: "assigned", type: { kind: "source-primitive", name: "bool" }, passingMode: "byref-writeonly-must-init" },
    { name: "snapshot", type: { kind: "source-primitive", name: "int64" }, passingMode: "byref-readonly" },
  ]);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderSignatureFixtures.js", "ProviderSignatureFixtures.ParameterModeTarget");
  const targetOptionalDefaults = findByIdSuffix(binding.members, optionalDefaultsId);
  const targetParamsRest = findByIdSuffix(binding.members, paramsRestId);
  const targetByRefModes = findByIdSuffix(binding.members, byRefModesId);
  assert.ok(targetOptionalDefaults);
  assert.ok(targetParamsRest);
  assert.ok(targetByRefModes);
  assert.equal(stripAssemblyQualifiers(targetOptionalDefaults.overloadGroup), "ProviderSignatureFixtures.ParameterModeTarget.OptionalDefaults");
  assert.deepEqual(parameterFacts(targetOptionalDefaults.parameters), [
    { name: "required", type: { kind: "target-named", id: "System.String" }, passingMode: "by-value" },
    {
      name: "count",
      type: { kind: "source-primitive", name: "int32" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "source-primitive", name: "int32", value: "7" },
    },
    {
      name: "mode",
      type: { kind: "target-named", id: "ProviderSignatureFixtures.SignatureMode" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "enum", value: "2", fieldName: "Enabled" },
    },
    {
      name: "label",
      type: { kind: "target-named", id: "System.String" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "null" },
    },
  ]);
  assert.equal(stripAssemblyQualifiers(targetParamsRest.overloadGroup), "ProviderSignatureFixtures.ParameterModeTarget.ParamsRest");
  assert.deepEqual(parameterFacts(targetParamsRest.parameters), [
    { name: "label", type: { kind: "target-named", id: "System.String" }, passingMode: "by-value" },
    {
      name: "values",
      type: { kind: "array", element: { kind: "source-primitive", name: "int32" } },
      passingMode: "by-value",
      paramsArray: true,
    },
  ]);
  assert.equal(stripAssemblyQualifiers(targetByRefModes.overloadGroup), "ProviderSignatureFixtures.ParameterModeTarget.ByRefModes");
  assert.deepEqual(parameterFacts(targetByRefModes.parameters), [
    { name: "current", type: { kind: "source-primitive", name: "int32" }, passingMode: "byref-readwrite" },
    { name: "assigned", type: { kind: "source-primitive", name: "bool" }, passingMode: "byref-writeonly-must-init" },
    { name: "snapshot", type: { kind: "source-primitive", name: "int64" }, passingMode: "byref-readonly" },
  ]);
});

test(".NET reflection provider preserves extension receiver passing per selected signature identity", () => {
  const reference = buildSignatureIdentityFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderSignatureFixtures.js", {});
  assert.equal("exports" in module, true);

  const rawTarget = module.exports.find((declaration) => declaration.sourceName === "MixedExtensionTarget");
  assert.ok(rawTarget);
  const rawTransformMembers = rawTarget.members.filter((member) =>
    member.kind === "method" &&
    member.targetName === "Transform"
  );
  assert.equal(rawTransformMembers.length, 2);

  const rawStaticTransform = rawTransformMembers.find((member) =>
    member.receiverPassing === undefined &&
    member.signatures.some((signature) => idEndsWith(signature.id, "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String)"))
  );
  const rawExtensionTransform = rawTransformMembers.find((member) =>
    member.receiverPassing === "first-argument" &&
    member.signatures.some((signature) => idEndsWith(signature.id, "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String,System.Int32)"))
  );
  assert.ok(rawStaticTransform);
  assert.ok(rawExtensionTransform);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceTarget = sourceModel.exports.find((declaration) => declaration.name === "MixedExtensionTarget");
  assert.ok(sourceTarget);
  const sourceTransform = sourceTarget.members.find((member) => member.kind === "method" && member.name === "transform");
  assert.ok(sourceTransform);
  assert.deepEqual(sourceTransform.signatures.map((signature) => stripAssemblyQualifiers(signature.id)).sort(), [
    "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String)",
    "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String,System.Int32)",
  ]);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderSignatureFixtures.js", "ProviderSignatureFixtures.MixedExtensionTarget");
  const targetStaticTransform = binding.members.find((member) =>
    idEndsWith(member.id, "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String)")
  );
  const targetExtensionTransform = binding.members.find((member) =>
    idEndsWith(member.id, "ProviderSignatureFixtures.MixedExtensionTarget.Transform(System.String,System.Int32)")
  );
  assert.ok(targetStaticTransform);
  assert.ok(targetExtensionTransform);
  assert.equal(targetStaticTransform.receiverPassing, undefined);
  assert.equal(targetExtensionTransform.receiverPassing, "first-argument");
});

test(".NET reflection provider classifies unsupported type families without silently dropping them", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const unsupportedFamilies = new Map(systemModule.unsupportedExports?.map((declaration) => [declaration.sourceName, declaration]) ?? []);
  const enumerator = unsupportedFamilies.get("Enumerator");

  assert.ok(enumerator);
  assert.equal(enumerator.kind, "unsupported-type-family");
  assert.ok(enumerator.metadataNames.includes("System.ArraySegment`1.Enumerator"));
  assert.ok(enumerator.metadataNames.includes("System.Span`1.Enumerator"));
  assert.match(enumerator.reason, /provider type-family declaration model/);

  assert.ok(systemModule.exports.some((declaration) => declaration.sourceName === "Action_1" && declaration.kind === "type"));
  assert.ok(systemModule.exports.some((declaration) => declaration.sourceName === "Func_2" && declaration.kind === "type"));
  assert.equal(getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Action`1")?.kind, "delegate");
  assert.equal(getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Func`2")?.kind, "delegate");
});

test(".NET reflection provider records unsupported members instead of silently dropping them", () => {
  const reference = buildUnsupportedMemberFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js", {});
  assert.equal("exports" in module, true);

  const typeByName = new Map(module.exports.map((declaration) => [declaration.sourceName, declaration]));
  const staticInterface = typeByName.get("IStaticInterfaceMember");
  const genericHolder = typeByName.get("GenericHolder");
  const multiIndexer = typeByName.get("MultiIndexer");
  const pointerSignatures = typeByName.get("PointerSignatures");
  const rankedArraySignatures = typeByName.get("RankedArraySignatures");
  const byRefReturnSignatures = typeByName.get("ByRefReturnSignatures");
  const genericNumber = typeByName.get("GenericNumber");
  const pointerConversion = typeByName.get("PointerConversion");
  const pointerDelegate = module.targetOnlyTypes?.find((declaration) => declaration.sourceName === "PointerDelegate");
  const refReturnDelegate = module.targetOnlyTypes?.find((declaration) => declaration.sourceName === "RefReturnDelegate");
  assert.ok(staticInterface);
  assert.ok(genericHolder);
  assert.ok(multiIndexer);
  assert.ok(pointerSignatures);
  assert.ok(rankedArraySignatures);
  assert.ok(byRefReturnSignatures);
  assert.ok(genericNumber);
  assert.ok(pointerConversion);
  assert.ok(pointerDelegate);
  assert.ok(refReturnDelegate);

  const staticInterfaceUnsupported = unsupportedMembersByMetadataName(staticInterface);
  assert.equal(staticInterface.members?.some((member) => member.targetName === "Create") ?? false, false);
  assert.equal(staticInterface.members?.some((member) => member.targetName === "StaticCount") ?? false, false);
  assert.match(
    staticInterfaceUnsupported.get("ProviderUnsupportedMemberFixtures.IStaticInterfaceMember.Create()")?.reason ?? "",
    /Static interface methods/u,
  );
  assert.match(
    staticInterfaceUnsupported.get("ProviderUnsupportedMemberFixtures.IStaticInterfaceMember.StaticCount")?.reason ?? "",
    /Static interface properties/u,
  );

  const genericHolderUnsupported = unsupportedMembersByMetadataName(genericHolder);
  assert.equal(genericHolder.members?.some((member) => member.targetName === "Echo") ?? false, false);
  assert.equal(genericHolder.members?.some((member) => member.targetName === "StaticValue") ?? false, false);
  assert.match(
    genericHolderUnsupported.get("ProviderUnsupportedMemberFixtures.GenericHolder`1.Echo(T)")?.reason ?? "",
    /declaring generic type parameter/u,
  );
  assert.match(
    genericHolderUnsupported.get("ProviderUnsupportedMemberFixtures.GenericHolder`1.StaticValue")?.reason ?? "",
    /declaring generic type parameter/u,
  );

  const multiIndexerUnsupported = unsupportedMembersByMetadataName(multiIndexer);
  assert.equal(multiIndexer.members?.some((member) => member.kind === "indexer") ?? false, false);
  assert.match(
    multiIndexerUnsupported.get("ProviderUnsupportedMemberFixtures.MultiIndexer.Item(System.Int32,System.Int32)")?.reason ?? "",
    /multiple parameters/u,
  );

  const pointerUnsupported = [...unsupportedMembersByMetadataName(pointerSignatures).values()];
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "PointerReturn") ?? false, false);
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "ReadPointer") ?? false, false);
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "PointerField") ?? false, false);
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "PointerProperty") ?? false, false);
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "Item") ?? false, false);
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "constructor" &&
    /parameter 'pointer'/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "field" &&
    member.targetName === "PointerField" &&
    /Field type/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "property" &&
    member.targetName === "PointerProperty" &&
    /Property type/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "indexer" &&
    member.targetName === "Item" &&
    /parameter 'pointer'/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "PointerReturn" &&
    /return type/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "ReadPointer" &&
    /parameter 'pointer'/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));

  const rankedArrayUnsupported = [...unsupportedMembersByMetadataName(rankedArraySignatures).values()];
  assert.equal(rankedArraySignatures.members?.some((member) => member.targetName === "MatrixField") ?? false, false);
  assert.equal(rankedArraySignatures.members?.some((member) => member.targetName === "MatrixProperty") ?? false, false);
  assert.equal(rankedArraySignatures.members?.some((member) => member.targetName === "MatrixReturn") ?? false, false);
  assert.equal(rankedArraySignatures.members?.some((member) => member.targetName === "AcceptMatrix") ?? false, false);
  assert.ok(rankedArrayUnsupported.some((member) =>
    member.memberKind === "constructor" &&
    /parameter 'matrix'/u.test(member.reason) &&
    /ranked CLR array/u.test(member.reason) &&
    member.reason.includes("System.Int32[,]")
  ));
  assert.ok(rankedArrayUnsupported.some((member) =>
    member.memberKind === "field" &&
    member.targetName === "MatrixField" &&
    /Field type/u.test(member.reason) &&
    /ranked CLR array/u.test(member.reason)
  ));
  assert.ok(rankedArrayUnsupported.some((member) =>
    member.memberKind === "property" &&
    member.targetName === "MatrixProperty" &&
    /Property type/u.test(member.reason) &&
    /ranked CLR array/u.test(member.reason)
  ));
  assert.ok(rankedArrayUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "MatrixReturn" &&
    /return type/u.test(member.reason) &&
    /ranked CLR array/u.test(member.reason)
  ));
  assert.ok(rankedArrayUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "AcceptMatrix" &&
    /parameter 'matrix'/u.test(member.reason) &&
    /ranked CLR array/u.test(member.reason)
  ));

  const byRefReturnUnsupported = [...unsupportedMembersByMetadataName(byRefReturnSignatures).values()];
  assert.equal(byRefReturnSignatures.members?.some((member) => member.targetName === "ValueProperty") ?? false, false);
  assert.equal(byRefReturnSignatures.members?.some((member) => member.targetName === "Item") ?? false, false);
  assert.equal(byRefReturnSignatures.members?.some((member) => member.targetName === "ValueRef") ?? false, false);
  assert.equal(byRefReturnSignatures.members?.some((member) => member.targetName === "ReadonlyValueRef") ?? false, false);
  assert.ok(byRefReturnUnsupported.some((member) =>
    member.memberKind === "property" &&
    member.targetName === "ValueProperty" &&
    /By-reference property or indexer returns/u.test(member.reason)
  ));
  assert.ok(byRefReturnUnsupported.some((member) =>
    member.memberKind === "indexer" &&
    member.targetName === "Item" &&
    /By-reference property or indexer returns/u.test(member.reason)
  ));
  assert.ok(byRefReturnUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "ValueRef" &&
    /returns 'System\.Int32&' by reference/u.test(member.reason)
  ));
  assert.ok(byRefReturnUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "ReadonlyValueRef" &&
    /returns 'System\.Int32&' by reference/u.test(member.reason)
  ));

  const genericNumberUnsupported = unsupportedMembersByMetadataName(genericNumber);
  assert.equal(genericNumber.members?.some((member) => member.kind === "operator") ?? false, false);
  assert.ok([...genericNumberUnsupported.values()].some((member) =>
    member.memberKind === "operator" &&
    member.targetName === "op_Addition" &&
    /generic-operator/u.test(member.reason)
  ));

  const pointerConversionUnsupported = [...unsupportedMembersByMetadataName(pointerConversion).values()];
  assert.equal(pointerConversion.conversionOperators?.length ?? 0, 0);
  assert.equal(pointerConversion.members?.some((member) => member.kind === "operator") ?? false, false);
  assert.ok(pointerConversionUnsupported.some((member) =>
    member.memberKind === "operator" &&
    member.targetName === "op_Explicit" &&
    /return type/u.test(member.reason) &&
    /System\.Int32\*/u.test(member.reason)
  ));

  assert.equal(module.exports.some((declaration) => declaration.sourceName === "PointerDelegate"), false);
  const unsupportedPointerDelegate = module.unsupportedExports?.find((declaration) =>
    declaration.kind === "unsupported-type-export" &&
    declaration.sourceName === "PointerDelegate"
  );
  assert.ok(unsupportedPointerDelegate);
  assert.equal(unsupportedPointerDelegate.metadataName, "ProviderUnsupportedMemberFixtures.PointerDelegate");
  assert.match(unsupportedPointerDelegate.reason, /Delegate invoke signature/u);
  assert.equal(pointerDelegate.metadataName, "ProviderUnsupportedMemberFixtures.PointerDelegate");

  assert.equal(module.exports.some((declaration) => declaration.sourceName === "RefReturnDelegate"), false);
  const unsupportedRefReturnDelegate = module.unsupportedExports?.find((declaration) =>
    declaration.kind === "unsupported-type-export" &&
    declaration.sourceName === "RefReturnDelegate"
  );
  assert.ok(unsupportedRefReturnDelegate);
  assert.equal(unsupportedRefReturnDelegate.metadataName, "ProviderUnsupportedMemberFixtures.RefReturnDelegate");
  assert.match(unsupportedRefReturnDelegate.reason, /Delegate invoke return type returns 'System\.Int32&' by reference/u);
  assert.equal(refReturnDelegate.metadataName, "ProviderUnsupportedMemberFixtures.RefReturnDelegate");
});

test(".NET target binding facts preserve unsupported target-only constraint evidence", () => {
  const declaration = {
    kind: "type",
    typeKind: "class",
    sourceName: "Constrained",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.Constrained`1"),
    metadataName: "ProviderModelFixtures.Constrained`1",
    typeParameters: [
      {
        name: "T",
        constraints: [{ kind: "reference-type" }],
        unsupportedConstraints: [
          {
            targetId: testTargetId("ProviderModelFixtures.PointerContract"),
            metadataName: "ProviderModelFixtures.PointerContract",
            reason: "Constraint uses a provider type-ref that is not representable.",
          },
        ],
      },
    ],
    implementedContracts: [{ kind: "implements", contract: namedDotnetTypeRef("ProviderModelFixtures.IRepresentable") }],
    unsupportedImplementedContracts: [
      {
        targetId: testTargetId("ProviderModelFixtures.IUnrepresentable"),
        metadataName: "ProviderModelFixtures.IUnrepresentable",
        reason: "Implemented contract uses a provider type-ref that is not representable.",
      },
    ],
  };

  const binding = dotnetExportToTargetBinding(declaration);

  assert.deepEqual(binding.typeParameters[0].constraints.map((constraint) => constraint.kind), [
    "reference-type",
    "unsupported",
  ]);
  assert.equal(binding.typeParameters[0].constraints[1].id, testTargetId("ProviderModelFixtures.PointerContract"));
  assert.deepEqual(binding.typeParameters[0].unsupportedConstraints, declaration.typeParameters[0].unsupportedConstraints);
  assert.equal(binding.implementedContracts[0].kind, "implements");
  assert.deepEqual(binding.unsupportedImplementedContracts, declaration.unsupportedImplementedContracts);
});

function unsupportedMembersByMetadataName(declaration) {
  return new Map(declaration.unsupportedMembers?.map((member) => [member.metadataName, member]) ?? []);
}

function constructorSignature(declaration, signatureId) {
  const signature = declaration.members
    ?.filter((member) => member.kind === "constructor")
    .flatMap((member) => member.signatures ?? [])
    .find((candidate) => idEndsWith(candidate.id, signatureId));
  assert.ok(signature, `constructor signature ${signatureId}`);
  return signature;
}

function methodSignature(declaration, memberName, signatureId) {
  const member = declaration.members?.find((candidate) =>
    candidate.kind === "method" &&
    (candidate.targetName === memberName || candidate.name === memberName || candidate.sourceName === memberName) &&
    candidate.signatures?.some((signature) => idEndsWith(signature.id, signatureId))
  );
  assert.ok(member, `method ${memberName}`);
  const signature = member.signatures.find((candidate) => idEndsWith(candidate.id, signatureId));
  assert.ok(signature, `method signature ${signatureId}`);
  return signature;
}

function parameterFacts(parameters) {
  return parameters.map((parameter) => ({
    name: parameter.name,
    type: typeFact(parameter.type),
    ...(parameter.passingMode !== undefined ? { passingMode: parameter.passingMode } : {}),
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { rest: true } : {}),
    ...(parameter.paramsArray === true ? { paramsArray: true } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.unsupportedDefaultValue !== undefined ? { unsupportedDefaultValue: parameter.unsupportedDefaultValue } : {}),
  }));
}

function typeFact(type) {
  switch (type.kind) {
    case "array":
      return {
        kind: "array",
        element: typeFact(type.element ?? type.elementType),
      };
    case "named":
      return {
        kind: "named",
        metadataName: type.metadataName,
      };
    case "source-primitive":
      return {
        kind: "source-primitive",
        name: type.name,
      };
    case "string":
      return { kind: "string" };
    case "target-named":
      return {
        kind: "target-named",
        id: stripAssemblyQualifiers(type.id),
      };
    default:
      return { kind: type.kind };
  }
}

function buildAttributeFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/attributes/AttributeProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "AttributeProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/attributes"),
  });
}

function buildConstructorFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constructors/ConstructorProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constructors/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constructors/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstructorProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constructors"),
  });
}

function buildUnsupportedEventFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-event/UnsupportedEventProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedEventProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/unsupported-event"),
  });
}

function buildUnsupportedMemberFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members/UnsupportedMembersProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedMembersProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members"),
  });
}

function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstraintProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constraints"),
  });
}

function buildConversionFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/conversions/ConversionProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConversionProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/conversions"),
  });
}

function buildSignatureIdentityFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/signature-identity/SignatureIdentityProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "SignatureIdentityProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/signature-identity"),
  });
}
