import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "./dotnet-provider.helpers.mjs";
import { mergeProviderSignatures } from "../dist/providers/dotnet/declaration-model/signatures.js";

import { getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";

test(".NET provider source selection preserves every wide primitive as bigint", () => {
  const signatures = ["int64", "uint64", "int128", "uint128"].map((name) => ({
    id: "Example.Wide",
    parameters: [{ name: "value", type: { kind: "source-primitive", name } }],
    returnType: { kind: "source-primitive", name },
  }));

  assert.deepEqual(mergeProviderSignatures(signatures), [{
    id: "Example.Wide",
    parameters: [{ name: "value", type: { kind: "bigint" } }],
    returnType: { kind: "bigint" },
  }]);
});

test(".NET provider declaration model preserves generic base arguments on heritage declarations", () => {
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
        moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
        exportName: "GenericBase",
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
  assert.deepEqual(derived.heritage, [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
      exportName: "GenericBase",
      typeArguments: [int32],
    },
  }]);
  assert.equal(derived.members, undefined);

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
test(".NET explicit CLR array target refs preserve provider-supplied rank facts", () => {
  const intType = { kind: "source-primitive", name: "int32" };

  assert.deepEqual(dotnetTypeRefToTargetTypeRef({
    kind: "array",
    elementType: intType,
  }), {
    kind: "array",
    element: intType,
  });
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({
    kind: "array",
    elementType: intType,
    rank: 2,
  }), {
    kind: "array",
    element: intType,
    rank: 2,
  });
});
test(".NET provider function source shapes preserve parameter modes and fail closed for unsupported parameter types", () => {
  const functionType = dotnetTypeRefToProviderType({
    kind: "function",
    id: "test.callback",
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
  assert.equal(functionType.id, '["$","test.callback"]');
  assert.equal(functionType.parameters[0].passingMode, "byref-writeonly-must-init");
  assert.equal(functionType.parameters[1].passingMode, undefined);
  assert.equal(functionType.parameters[1].optional, true);

  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "function",
    id: "test.unsupported-pointer-callback",
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
test(".NET provider declaration model exposes namespace members as fact-backed provider members", () => {
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    namespaceName: "ProviderModelFixtures",
    exports: [
      {
        kind: "namespace",
        sourceName: "Native",
        namespaceName: "ProviderModelFixtures.Native",
        exports: [
          {
            kind: "value",
            sourceName: "answer",
            targetId: testTargetId("ProviderModelFixtures.Native.Answer"),
            metadataName: "ProviderModelFixtures.Native.Answer",
            type: { kind: "source-primitive", name: "int32" },
          },
          {
            kind: "function",
            sourceName: "compute",
            targetId: testTargetId("ProviderModelFixtures.Native.Compute"),
            metadataName: "ProviderModelFixtures.Native.Compute(System.String)",
            signatures: [
              {
                id: testTargetId("ProviderModelFixtures.Native.Compute(System.String)"),
                sourceId: testTargetId("ProviderModelFixtures.Native.Compute(System.String)"),
                parameters: [
                  { name: "text", type: { kind: "string" }, passingMode: "by-value" },
                ],
                returnType: { kind: "source-primitive", name: "int32" },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);
  const nativeNamespace = model.exports.find((declaration) => declaration.kind === "namespace" && declaration.name === "Native");
  assert.ok(nativeNamespace);
  assert.equal(nativeNamespace.id, "ProviderModelFixtures.Native");
  const answer = nativeNamespace.members.find((member) => member.name === "answer");
  const compute = nativeNamespace.members.find((member) => member.name === "compute");
  assert.deepEqual(answer, {
    id: testTargetId("ProviderModelFixtures.Native.Answer"),
    name: "answer",
    kind: "property",
    static: true,
    type: { kind: "source-primitive", name: "int32" },
  });
  assert.equal(compute.kind, "method");
  assert.equal(compute.id, testTargetId("ProviderModelFixtures.Native.Compute"));
  assert.deepEqual(compute.signatures, [
    {
      id: testTargetId("ProviderModelFixtures.Native.Compute(System.String)"),
      parameters: [{ name: "text", type: { kind: "string" } }],
      returnType: { kind: "source-primitive", name: "int32" },
    },
  ]);
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
    moduleSpecifier: "@tsonic/dotnet/ProviderModelFixtures.js",
    exportName: "Box",
    typeArguments: [pointerType],
  }), undefined);
  assert.equal(tryDotnetTypeRefToProviderType({
    kind: "provider-ref",
    name: "Box",
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
    implicitArrayInput: true,
  });

  assert.equal(raw.csharpArrayLiteralElementType, undefined);
  assert.equal(raw.csharpImplicitArrayInputElementType, undefined);
  assert.deepEqual(providerProven.csharpArrayLiteralElementType, { kind: "source-primitive", name: "int32" });
  assert.deepEqual(providerProven.csharpImplicitArrayInputElementType, { kind: "source-primitive", name: "int32" });
});
test(".NET target binding uses provider-owned target member names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Collections.Generic.js", "System.Collections.Generic.List`1");

  const count = binding.members.find((member) => member.sourceName === "Count");
  const item = binding.members.find((member) => member.sourceName === "Item");

  assert.equal(count?.targetName, "Count");
  assert.equal(item?.targetName, "Item");
});
test(".NET reflection provider records attribute facts as target data without source-visible fake semantics", () => {
  const reference = buildAttributeFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderAttributeFixtures.js", {});
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

  const rawRun = rawTarget.members.find((member) => member.kind === "method" && member.sourceName === "Run");
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
  assert.equal(JSON.stringify(stripTargetPayload(sourceTarget)).includes("SampleAttribute"), false);

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
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Linq.js", {});
  assert.equal("exports" in module, true);

  const enumerable = module.exports.find((declaration) => declaration.sourceName === "Enumerable");
  assert.ok(enumerable);
  const rawAverage = enumerable.members.find((member) =>
    member.kind === "method" &&
    member.sourceName === "Average" &&
    member.receiverPassing === "first-argument"
  );
  assert.ok(rawAverage);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Linq.js", "System.Linq.Enumerable");
  const average = binding.members.find((member) =>
    member.kind === "method" &&
    member.sourceName === "Average" &&
    member.receiverPassing === "first-argument"
  );
  assert.ok(average);
  assert.equal(average.static, true);
  assert.equal(average.parameters[0].passingMode, "by-value");
});
test(".NET provider source declarations keep extension-method signature identities for explicit calls", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {});
  assert.equal("exports" in module, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const memoryExtensions = declarationModel.exports.find((declaration) => declaration.name === "MemoryExtensions");
  assert.ok(memoryExtensions);

  const asSpan = memoryExtensions.members.find((member) =>
    member.kind === "method" &&
    member.name === "AsSpan" &&
    member.static === true
  );
  assert.ok(asSpan);

  const signature = findByIdSuffix(asSpan.signatures, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.ok(signature);
  const indexSignature = findByIdSuffix(asSpan.signatures, "System.MemoryExtensions.AsSpan(System.String,System.Index)");
  assert.ok(indexSignature);
  assert.ok(
    asSpan.signatures.indexOf(signature) < asSpan.signatures.indexOf(indexSignature),
    "source-exact int32 overload must appear before provider-ref Index projection so TSTS source overload selection does not drift toward target-only conversions",
  );
  assert.equal(signature.name, "AsSpan");
  assert.deepEqual(signature.parameters.map((parameter) => parameter.name), ["text", "start"]);
  assert.deepEqual(signature.parameters[0].type, {
    kind: "union",
    types: [{ kind: "string" }, { kind: "undefined" }],
  });
  assert.deepEqual(signature.parameters[1].type, { kind: "source-primitive", name: "int32" });

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.MemoryExtensions");
  const targetMember = findByIdSuffix(binding.members, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.ok(targetMember);
  assert.equal(targetMember.receiverPassing, "first-argument");
});
test(".NET provider projects extension methods onto proven source receivers without changing target identity", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedExports: ["String"] });
  assert.equal("exports" in module, true);

  const rawString = module.exports.find((declaration) => declaration.sourceName === "String");
  assert.ok(rawString);
  const rawAsSpan = rawString.members.find((member) =>
    member.kind === "method" &&
    member.sourceName === "AsSpan" &&
    member.sourceParameterOffset === 1
  );
  assert.ok(rawAsSpan);
  assert.equal(rawAsSpan.static, true);
  assert.equal(rawAsSpan.sourceStatic, false);
  assert.equal(rawAsSpan.receiverPassing, "first-argument");
  assert.equal(rawAsSpan.targetDeclaringType.metadataName, "System.MemoryExtensions");

  const declarationModel = dotnetModuleToProviderDeclarationModel(module, {
    resolveModule(specifier, requestedExports) {
      const resolved = getCompleteDotnetModule(provider, specifier, { requestedExports });
      return "exports" in resolved ? resolved : undefined;
    },
  });
  const sourceString = declarationModel.exports.find((declaration) => declaration.name === "String");
  assert.ok(sourceString);
  const sourceAsSpan = sourceString.members.find((member) =>
    member.kind === "method" &&
    member.name === "AsSpan"
  );
  assert.ok(sourceAsSpan);
  assert.equal(sourceAsSpan.static, false);
  assert.deepEqual(sourceAsSpan.signatures[0].parameters.map((parameter) => parameter.name), []);

  const binding = dotnetExportToTargetBinding(rawString);
  const targetAsSpan = findByIdSuffix(binding.members, "System.MemoryExtensions.AsSpan(System.String)");
  assert.ok(targetAsSpan);
  assert.equal(targetAsSpan.static, true);
  assert.equal(targetAsSpan.receiverPassing, "first-argument");
  assert.equal(stripAssemblyQualifiers(targetAsSpan.declaringType.id), "System.MemoryExtensions");
  assert.deepEqual(targetAsSpan.parameters.map((parameter) => parameter.name), ["text"]);
});
test(".NET provider declaration model orders source-exact overloads before provider projection overloads", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.IO.js", {});
  assert.equal("exports" in module, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const file = declarationModel.exports.find((declaration) => declaration.name === "File");
  assert.ok(file);
  const writeAllText = file.members.find((member) =>
    member.kind === "method" &&
    member.name === "WriteAllText" &&
    member.static === true
  );
  assert.ok(writeAllText);

  const stringSignature = findByIdSuffix(writeAllText.signatures, "System.IO.File.WriteAllText(System.String,System.String)");
  const spanSignature = findByIdSuffix(writeAllText.signatures, "System.IO.File.WriteAllText(System.String,System.ReadOnlySpan`1<System.Char>)");
  assert.ok(stringSignature);
  assert.ok(spanSignature);
  assert.ok(
    writeAllText.signatures.indexOf(stringSignature) < writeAllText.signatures.indexOf(spanSignature),
    "source-exact string overload must appear before provider-ref ReadOnlySpan projection so TSTS source overload selection remains source-truthful",
  );
});
test(".NET provider models LINQ ExtensionMethods receiver metadata from target facts", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Linq.js", {});
  assert.equal("exports" in module, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const enumerable = declarationModel.exports.find((declaration) => declaration.name === "Enumerable");
  assert.ok(enumerable);
  const average = enumerable.members.find((member) =>
    member.kind === "method" &&
    member.name === "Average" &&
    member.static === true
  );
  assert.ok(average);
  assert.ok(average.signatures.some((signature) => signature.id.includes("#source-signature:")));

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
            sourceId: testTargetId("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)"),
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
  const bindingProvider = createDotnetSourceDeclarationProvider({
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
    /^tsts-provider:\/\/acme\.dotnet\.fixture-provider\/%40tsonic%2Fdotnet%2FSystem\.Text\.js\.d\.ts$/u,
  );
});
