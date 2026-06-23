import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";
import {
  dotnetExportToTargetBinding,
} from "../dist/providers/dotnet/model.js";

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
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
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

test(".NET provider source declarations omit target-only generic constraints", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const buffersModule = provider.getModule("@tsonic/dotnet/System.Buffers.js", {});
  assert.equal("exports" in buffersModule, true);

  const rawSequenceReader = buffersModule.exports.find((declaration) => declaration.sourceName === "SequenceReader");
  assert.ok(rawSequenceReader);
  assert.ok(rawSequenceReader.typeParameters?.[0]?.constraints?.some((constraint) => constraint.kind === "implements"));

  const declarationModel = dotnetModuleToProviderDeclarationModel(buffersModule);
  const sequenceReader = declarationModel.exports.find((declaration) => declaration.name === "SequenceReader");
  assert.ok(sequenceReader);
  assert.deepEqual(sequenceReader.typeParameters, [{ name: "T" }]);
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

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceReferenceNewTarget = declarationModel.exports.find((declaration) => declaration.name === "ReferenceNewTarget");
  assert.ok(sourceReferenceNewTarget);
  assert.deepEqual(sourceReferenceNewTarget.typeParameters, [{ name: "T" }]);
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
});

test(".NET provider source declarations keep readonly TS-compatible numeric indexers", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const specializedModule = provider.getModule("@tsonic/dotnet/System.Collections.Specialized.js", {});
  assert.equal("exports" in specializedModule, true);

  const rawNameValueCollection = specializedModule.exports.find((declaration) => declaration.sourceName === "NameValueCollection");
  assert.ok(rawNameValueCollection);
  assert.equal(rawNameValueCollection.members.filter((member) => member.kind === "indexer").length, 2);

  const declarationModel = dotnetModuleToProviderDeclarationModel(specializedModule);
  const nameValueCollection = declarationModel.exports.find((declaration) => declaration.name === "NameValueCollection");
  assert.ok(nameValueCollection);
  const indexers = nameValueCollection.members.filter((member) => member.kind === "indexer");
  assert.equal(indexers.length, 1);
  assert.equal(indexers[0].readonly, true);
  assert.deepEqual(indexers[0].signatures[0].parameters[0].type, { kind: "source-primitive", name: "int32" });
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

test(".NET reflection provider classifies unsupported type families without silently dropping them", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const unsupportedFamilies = new Map(systemModule.unsupportedExports?.map((declaration) => [declaration.sourceName, declaration]) ?? []);
  const action = unsupportedFamilies.get("Action");
  const func = unsupportedFamilies.get("Func");

  assert.ok(action);
  assert.equal(action.kind, "unsupported-type-family");
  assert.ok(action.metadataNames.includes("System.Action"));
  assert.ok(action.metadataNames.includes("System.Action`1"));
  assert.match(action.reason, /provider type-family declaration model/);

  assert.ok(func);
  assert.equal(func.kind, "unsupported-type-family");
  assert.ok(func.metadataNames.includes("System.Func`1"));
  assert.ok(func.metadataNames.includes("System.Func`2"));
  assert.match(func.reason, /provider type-family declaration model/);

  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Action`1"));
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Func`2"));

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
  const genericNumber = typeByName.get("GenericNumber");
  assert.ok(staticInterface);
  assert.ok(genericHolder);
  assert.ok(multiIndexer);
  assert.ok(pointerSignatures);
  assert.ok(genericNumber);

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
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "constructor" &&
    /parameter type/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "field" &&
    member.targetName === "PointerField" &&
    /Field type/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "PointerReturn" &&
    /return type/u.test(member.reason)
  ));
  assert.ok(pointerUnsupported.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "ReadPointer" &&
    /parameter type/u.test(member.reason)
  ));

  const genericNumberUnsupported = unsupportedMembersByMetadataName(genericNumber);
  assert.equal(genericNumber.members?.some((member) => member.kind === "operator") ?? false, false);
  assert.ok([...genericNumberUnsupported.values()].some((member) =>
    member.memberKind === "operator" &&
    member.targetName === "op_Addition" &&
    /generic-operator/u.test(member.reason)
  ));
});

function unsupportedMembersByMetadataName(declaration) {
  return new Map(declaration.unsupportedMembers?.map((member) => [member.metadataName, member]) ?? []);
}

function buildUnsupportedEventFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-event/UnsupportedEventProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "UnsupportedEventProviderFixture.dll");
}

function buildUnsupportedMemberFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members/UnsupportedMembersProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "UnsupportedMembersProviderFixture.dll");
}

function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "ConstraintProviderFixture.dll");
}

function buildConversionFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/conversions/ConversionProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "ConversionProviderFixture.dll");
}

function buildSignatureIdentityFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/signature-identity/SignatureIdentityProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "SignatureIdentityProviderFixture.dll");
}
