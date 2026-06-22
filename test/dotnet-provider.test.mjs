import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";
import {
  dotnetExportToTargetBinding,
} from "../dist/providers/dotnet/model.js";

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
        metadataName: "System.Collections.Generic.Dictionary`2",
        members: [
          {
            kind: "method",
            sourceName: "tryGetValue",
            targetName: "TryGetValue",
            metadataName: "System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)",
            signatures: [
              {
                id: "System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)",
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
        metadataName: "System.Example",
        members: [
          {
            kind: "property",
            sourceName: "unsafeTargetOnly",
            targetName: "UnsafeTargetOnly",
            metadataName: "System.Example.UnsafeTargetOnly",
            type: {
              kind: "named",
              metadataName: "System.Environment.SpecialFolder",
              displayName: "System.Environment.SpecialFolder",
            },
          },
          {
            kind: "property",
            sourceName: "safeString",
            targetName: "SafeString",
            metadataName: "System.Example.SafeString",
            type: {
              kind: "named",
              metadataName: "System.String",
              displayName: "System.String",
              sourceShape: { kind: "string" },
            },
          },
          {
            kind: "method",
            sourceName: "unsafeMethod",
            targetName: "UnsafeMethod",
            metadataName: "System.Example.UnsafeMethod",
            signatures: [
              {
                id: "System.Example.UnsafeMethod(System.Environment.SpecialFolder)",
                parameters: [
                  {
                    name: "folder",
                    type: {
                      kind: "named",
                      metadataName: "System.Environment.SpecialFolder",
                      displayName: "System.Environment.SpecialFolder",
                    },
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
  assert.deepEqual(example.members.map((member) => member.name), ["safeString"]);
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
    dotnetTypeRefToTargetTypeRef({ kind: "named", metadataName: "System.String" }),
    dotnetTypeRefToTargetTypeRef({ kind: "named", metadataName: "System.Void" }),
    dotnetTypeRefToTargetTypeRef({ kind: "named", metadataName: "System.Boolean" }),
    dotnetTypeRefToTargetTypeRef({ kind: "named", metadataName: "System.Numerics.BigInteger" }),
    dotnetTypeRefToTargetTypeRef({ kind: "named", metadataName: "System.Nullable`1", typeArguments: [intType] }),
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
    metadataName: "System.String",
  });
  const booleanBinding = dotnetExportToTargetBinding({
    kind: "type",
    typeKind: "struct",
    sourceName: "Boolean",
    namespaceName: "System",
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
    metadataName: "System.Collections.Generic.IEnumerable`1",
    displayName: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
  });
  const providerProven = dotnetTypeRefToTargetTypeRef({
    kind: "named",
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
  const binding = provider.findTargetBindingByTargetId("System.Collections.Generic.List`1");
  assert.ok(binding);

  const count = binding.members.find((member) => member.sourceName === "count");
  const item = binding.members.find((member) => member.sourceName === "item");

  assert.equal(count?.targetName, "Count");
  assert.equal(item?.targetName, "Item");
});

test(".NET reflection provider proves collection constructor array-literal element metadata", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const binding = provider.findTargetBindingByTargetId("System.Collections.Generic.List`1");
  assert.ok(binding);

  const collectionConstructor = binding.members.find((member) =>
    member.kind === "constructor" &&
    member.parameters[0]?.type.kind === "target-named" &&
    member.parameters[0].type.id === "System.Collections.Generic.IEnumerable`1"
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

  const int32 = provider.findTargetBindingByTargetId("System.Int32");
  assert.ok(int32);
  assert.ok(int32.implementedContracts.some((contract) =>
    contract.kind === "implements" &&
    contract.contract === "System.IEquatable`1" &&
    contract.typeArguments?.[0]?.kind === "source-primitive" &&
    contract.typeArguments[0].name === "int32"
  ));

  const dateTime = provider.findTargetBindingByTargetId("System.DateTime");
  assert.ok(dateTime);
  assert.ok(dateTime.members.some((member) =>
    member.kind === "operator" &&
    member.sourceName === "addition" &&
    member.targetName === "op_Addition"
  ));

  const specialFolder = provider.findTargetBindingByTargetId("System.Environment.SpecialFolder");
  assert.ok(specialFolder);
  assert.equal(specialFolder.kind, "enum");
  assert.ok(specialFolder.members.some((member) =>
    member.kind === "field" &&
    member.static === true &&
    member.sourceName === "desktop" &&
    member.targetName === "Desktop"
  ));

  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  assert.equal(systemModule.exports.some((declaration) => declaration.sourceName === "SpecialFolder"), false);
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Environment.SpecialFolder"));
});

test(".NET reflection provider keeps unmodelled nested CLR types out of source declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const rawEnvironment = systemModule.exports.find((declaration) => declaration.sourceName === "Environment");
  assert.ok(rawEnvironment);
  assert.ok(rawEnvironment.members.some((member) => member.sourceName === "getFolderPath"));

  const declarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const environment = declarationModel.exports.find((declaration) => declaration.name === "Environment");
  assert.ok(environment);
  assert.equal(environment.members.some((member) => member.name === "getFolderPath"), false);
  assert.equal(environment.members.some((member) => member.name === "newLine"), true);

  assert.ok(provider.findTargetBindingByTargetId("System.Environment.SpecialFolder"));
});

test(".NET reflection provider preserves cross-namespace source-visible provider refs", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const ioModule = provider.getModule("@tsonic/dotnet/System.IO.js", {});
  assert.equal("exports" in ioModule, true);

  const binaryReader = ioModule.exports.find((declaration) => declaration.sourceName === "BinaryReader");
  assert.ok(binaryReader);
  const encodingConstructor = binaryReader.members.find((member) =>
    member.kind === "constructor" &&
    member.signatures.some((signature) => signature.id === "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)")
  );
  assert.ok(encodingConstructor);
  const encodingParameter = encodingConstructor.signatures
    .find((signature) => signature.id === "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)")
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
    member.signatures.some((signature) => signature.id === "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)")
  );
  assert.ok(sourceEncodingConstructor);
  const sourceEncodingParameter = sourceEncodingConstructor.signatures
    .find((signature) => signature.id === "System.IO.BinaryReader..ctor(System.IO.Stream,System.Text.Encoding)")
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

test(".NET provider source declarations keep only TS-compatible numeric indexers", () => {
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
  assert.deepEqual(indexers[0].signatures[0].parameters[0].type, { kind: "source-primitive", name: "int32" });
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

  const targetBinding = provider.findTargetBindingByTargetId("System.Predicate`1");
  assert.equal(targetBinding?.kind, "delegate");
  assert.equal(targetBinding?.csharpType.kind, "target-named");
  assert.equal(targetBinding?.csharpType.kind === "target-named" ? targetBinding.csharpType.id : undefined, "System.Predicate`1");
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

  const specialFolder = systemModule.unsupportedExports?.find((declaration) =>
    declaration.kind === "unsupported-nested-type" &&
    declaration.metadataName === "System.Environment.SpecialFolder"
  );
  assert.ok(specialFolder);
  assert.equal(specialFolder.sourceName, "SpecialFolder");
  assert.equal(specialFolder.declaringMetadataName, "System.Environment");
  assert.match(specialFolder.reason, /nested-type declaration model/);

  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Action`1"));
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Func`2"));
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Environment.SpecialFolder"));

  assert.equal(provider.findTargetBindingByTargetId("System.Action`1")?.kind, "delegate");
  assert.equal(provider.findTargetBindingByTargetId("System.Func`2")?.kind, "delegate");
});
