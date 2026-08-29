import { readdirSync, readFileSync } from "node:fs";
import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, completeDotnetProviderContext, completeProviderDeclarationRequest, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

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
                sourceId: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)"),
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
  assert.deepEqual(tryDotnetTypeRefToProviderType({
    kind: "array",
    elementType: { kind: "source-primitive", name: "int32" },
  }), {
    kind: "array",
    elementType: { kind: "source-primitive", name: "int32" },
  });

  const module = augmentDotnetModuleWithNativeArray(
    {
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
    },
    completeDotnetProviderContext({ requestedExports: ["Array"] }),
  );
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

  const create = providerArray.members.find((member) => member.name === "Create");
  const length = providerArray.members.find((member) => member.name === "Length");
  const indexer = providerArray.members.find((member) => member.kind === "indexer");
  assert.equal(create.id, `${dotnetNativeArrayTypeId}#source-member#static#Create`);
  assert.equal(create.static, true);
  assert.equal(create.signatures[0].id, dotnetNativeArrayCreateMemberId);
  assert.deepEqual(create.signatures[0].typeParameters, [{ name: "TMethod" }]);
  assert.deepEqual(create.signatures[0].returnType, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    exportName: "Array",
    typeArguments: [{ kind: "type-parameter", name: "TMethod" }],
  });
  assert.equal(length.id, `${dotnetNativeArrayTypeId}#source-member#instance#Length`);
  assert.equal(length.readonly, true);
  assert.equal(indexer.id, `${dotnetNativeArrayTypeId}#source-indexer`);
  assert.equal(indexer.signatures[0].id, dotnetNativeArrayIndexerMemberId);
  assert.equal(indexer.readonly, undefined);

  const binding = dotnetExportToTargetBinding(nativeArray);
  assert.ok(binding);
  assert.equal(binding.csharpType.kind, "array");
  assert.equal(binding.csharpType.element.kind, "type-parameter");
  const targetCreate = binding.members.find((member) =>
    member.id === dotnetNativeArrayCreateMemberId
  );
  assert.ok(targetCreate);
  assert.equal(targetCreate.typeParameters, undefined);
  assert.deepEqual(targetCreate.csharpInvocation, {
    kind: "array-creation",
    lengthParameterIndex: 0,
  });
  assert.equal(binding.members.find((member) => member.id === dotnetNativeArrayLengthMemberId).targetName, "Length");
  assert.equal(binding.members.find((member) => member.id === dotnetNativeArrayIndexerMemberId).targetName, "Item");
});

test(".NET reflection provider returns requested export declaration closures instead of whole namespaces", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const exportNames = module.exports.map((declaration) => declaration.sourceName).sort();
  assert.deepEqual(exportNames, [
    "ArraySegment",
    "ArraySegment_Enumerator",
    "AsyncCallback",
    "Base64FormattingOptions",
    "Boolean",
    "Byte",
    "Char",
    "CharEnumerator",
    "Convert",
    "DateOnly",
    "DateTime",
    "DateTimeKind",
    "DateTimeOffset",
    "DayOfWeek",
    "Decimal",
    "Delegate",
    "Double",
    "Enum",
    "Func_1",
    "Func_10",
    "Func_11",
    "Func_12",
    "Func_13",
    "Func_14",
    "Func_15",
    "Func_16",
    "Func_17",
    "Func_2",
    "Func_3",
    "Func_4",
    "Func_5",
    "Func_6",
    "Func_7",
    "Func_8",
    "Func_9",
    "Guid",
    "Half",
    "IAsyncResult",
    "ICloneable",
    "IComparable",
    "IComparable_1",
    "IConvertible",
    "IDisposable",
    "IEquatable",
    "IFormatProvider",
    "IFormattable",
    "IParsable",
    "ISpanFormattable",
    "ISpanParsable",
    "IUtf8SpanFormattable",
    "IUtf8SpanParsable",
    "Index",
    "Int128",
    "Int16",
    "Int32",
    "Int64",
    "IntPtr",
    "InvocationListEnumerator",
    "Memory",
    "MidpointRounding",
    "ModuleHandle",
    "MulticastDelegate",
    "Object",
    "Range",
    "ReadOnlyMemory",
    "ReadOnlySpan",
    "ReadOnlySpan_Enumerator",
    "RuntimeFieldHandle",
    "RuntimeMethodHandle",
    "RuntimeTypeHandle",
    "SByte",
    "Single",
    "Span",
    "SpanSplitEnumerator",
    "Span_Enumerator",
    "String",
    "StringComparison",
    "StringSplitOptions",
    "TimeOnly",
    "TimeSpan",
    "TryWriteInterpolatedStringHandler",
    "Type",
    "TypeCode",
    "UInt128",
    "UInt16",
    "UInt32",
    "UInt64",
    "UIntPtr",
    "ValueTuple",
    "ValueTuple_1",
    "ValueTuple_2",
    "ValueTuple_3",
    "ValueTuple_4",
    "ValueTuple_5",
    "ValueTuple_6",
    "ValueTuple_7",
    "ValueTuple_8",
    "ValueType",
    "__dotnet_12_ArraySegment_12_property_get_5_Empty",
    "__dotnet_12_ReadOnlySpan_12_property_get_5_Empty",
    "__dotnet_12_ReadOnlySpan_4_call_6_CastUp",
    "__dotnet_13_ISpanParsable_4_call_5_Parse",
    "__dotnet_13_ISpanParsable_4_call_8_TryParse",
    "__dotnet_14_ReadOnlyMemory_12_property_get_5_Empty",
    "__dotnet_17_IUtf8SpanParsable_4_call_5_Parse",
    "__dotnet_17_IUtf8SpanParsable_4_call_8_TryParse",
    "__dotnet_4_Span_12_property_get_5_Empty",
    "__dotnet_6_Memory_12_property_get_5_Empty",
    "__dotnet_9_IParsable_4_call_5_Parse",
    "__dotnet_9_IParsable_4_call_8_TryParse",
  ]);

  const convert = module.exports.find((declaration) => declaration.sourceName === "Convert");
  assert.ok(convert);
  assert.equal(convert.members?.some((member) => member.sourceName === "ToByte"), true);

  const formatProvider = module.exports.find((declaration) => declaration.sourceName === "IFormatProvider");
  assert.ok(formatProvider);
  assert.deepEqual(
    formatProvider.members?.map((member) => `${member.kind}:${member.sourceName}`).sort(),
    ["method:GetFormat"],
  );
});

test(".NET provider preserves exact CLR source-visible member names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {
    requestedExports: ["Console", "Environment", "DateTime", "SpecialFolder"],
  });
  const collectionsModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Collections.Generic.js", {
    requestedExports: ["List"],
  });
  assert.equal("exports" in systemModule, true, JSON.stringify(systemModule));
  assert.equal("exports" in collectionsModule, true, JSON.stringify(collectionsModule));

  const console = systemModule.exports.find((declaration) => declaration.sourceName === "Console");
  const environment = systemModule.exports.find((declaration) => declaration.sourceName === "Environment");
  const dateTime = systemModule.exports.find((declaration) => declaration.sourceName === "DateTime");
  const specialFolder = systemModule.exports.find((declaration) => declaration.sourceName === "SpecialFolder");
  const list = collectionsModule.exports.find((declaration) => declaration.sourceName === "List");

  requireDotnetMember(console, "method", "WriteLine");
  requireDotnetMember(list, "method", "Add");
  requireDotnetMember(environment, "property", "NewLine");
  requireDotnetMember(dateTime, "field", "MinValue");
  requireDotnetMember(specialFolder, "field", "Desktop");

  const systemModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const collectionsModel = dotnetModuleToProviderDeclarationModel(collectionsModule);
  const sourceConsole = systemModel.exports.find((declaration) => declaration.name === "Console");
  const sourceEnvironment = systemModel.exports.find((declaration) => declaration.name === "Environment");
  const sourceDateTime = systemModel.exports.find((declaration) => declaration.name === "DateTime");
  const sourceSpecialFolder = systemModel.exports.find((declaration) => declaration.name === "SpecialFolder");
  const sourceList = collectionsModel.exports.find((declaration) => declaration.name === "List");

  requireProviderDeclarationMember(sourceConsole, "method", "WriteLine");
  requireProviderDeclarationMember(sourceList, "method", "Add");
  requireProviderDeclarationMember(sourceEnvironment, "property", "NewLine");
  requireProviderDeclarationMember(sourceDateTime, "field", "MinValue");
  requireProviderDeclarationMember(sourceSpecialFolder, "field", "Desktop");
});

test(".NET reflection provider exposes CLR arity variants as source-visible type families", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Threading.Tasks.js", {
    requestedExports: ["Task"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const task = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Task"
  );
  const taskOfT = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Task_1"
  );
  assert.ok(task);
  assert.ok(taskOfT);
  assert.deepEqual(task.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 0,
  });
  assert.deepEqual(taskOfT.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 1,
  });
  assert.equal(task.typeParameters, undefined);
  assert.deepEqual(taskOfT.typeParameters?.map((parameter) => parameter.name), ["TResult"]);
  assert.equal(task.members?.some((member) => member.sourceName === "Result"), false);
  assert.equal(taskOfT.members?.some((member) => member.sourceName === "Result"), true);
  const rawContinueWith = taskOfT.members?.find((member) => member.sourceName === "ContinueWith");
  const rawFuncStateContinueWith = rawContinueWith?.signatures.find((signature) =>
    signature.id.includes("System.Threading.Tasks.Task`1.ContinueWith``1(") &&
    signature.id.includes("System.Func`3<") &&
    signature.id.includes("System.Object,TNewResult>") &&
    signature.parameters.length === 2
  );
  assert.ok(rawFuncStateContinueWith);
  assert.deepEqual(rawFuncStateContinueWith.parameters[1].type, {
    kind: "nullable-reference",
    elementType: { kind: "object" },
  });
  assert.deepEqual(rawFuncStateContinueWith.parameters[1].sourceType, {
    kind: "unknown",
  });
  const targetTaskOfT = dotnetExportToTargetBinding(taskOfT);
  const targetContinueWithState = targetTaskOfT.members.find((member) =>
    member.id.includes("System.Threading.Tasks.Task`1.ContinueWith``1(") &&
    member.id.includes("System.Func`3<") &&
    member.parameters?.length === 2
  );
  assert.ok(targetContinueWithState);
  assert.deepEqual(targetContinueWithState.parameters[1].type, {
    kind: "target-named",
    id: "System.Object",
    csharpRender: { kind: "predefined", name: "object" },
    csharpNullableReference: true,
  });
  assert.equal(targetContinueWithState.parameters[1].csharpAcceptsCheckedSourceArgument, true);
  const model = dotnetModuleToProviderDeclarationModel(module);
  const sourceTask = model.exports.find((declaration) =>
    declaration.kind === "class" && declaration.name === "Task"
  );
  const sourceTaskOfT = model.exports.find((declaration) =>
    declaration.kind === "class" && declaration.name === "Task_1"
  );
  assert.ok(sourceTask);
  assert.ok(sourceTaskOfT);
  assert.deepEqual(sourceTask.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 0,
  });
  assert.deepEqual(sourceTaskOfT.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 1,
  });
  assert.equal(sourceTask.members?.some((member) => member.name === "Result"), false);
  assert.equal(sourceTaskOfT.members?.some((member) => member.name === "Result"), true);
  assert.equal(sourceTaskOfT.members?.some((member) => member.name === "ContinueWith"), true);
  const continueWith = sourceTaskOfT.members?.find((member) => member.name === "ContinueWith");
  assert.ok(continueWith);
  const firstGenericContinueWith = continueWith.signatures.find((signature) =>
    signature.id.includes("System.Threading.Tasks.Task`1.ContinueWith``1(")
  );
  const firstBaseGenericContinueWith = continueWith.signatures.find((signature) =>
    signature.id.includes("System.Threading.Tasks.Task.ContinueWith``1(")
  );
  assert.ok(firstGenericContinueWith);
  assert.ok(firstBaseGenericContinueWith);
  assert.ok(
    continueWith.signatures.indexOf(firstGenericContinueWith) < continueWith.signatures.indexOf(firstBaseGenericContinueWith),
    "derived Task<T>.ContinueWith overloads must precede inherited Task.ContinueWith overloads so TSTS contextual typing preserves Task<T>.Result",
  );

  const actionStateContinueWith = continueWith.signatures.find((signature) =>
    signature.id.includes("System.Threading.Tasks.Task`1.ContinueWith(System.Private.CoreLib") &&
    signature.id.includes("System.Action`2<") &&
    signature.id.includes("System.Object)")
  );
  const funcStateContinueWith = continueWith.signatures.find((signature) =>
    signature.id.includes("System.Threading.Tasks.Task`1.ContinueWith``1(") &&
    signature.id.includes("System.Func`3<") &&
    signature.id.includes("System.Object,TNewResult>")
  );
  assert.ok(actionStateContinueWith);
  assert.ok(funcStateContinueWith);
  assert.deepEqual(funcStateContinueWith.parameters[1].type, {
    kind: "unknown",
  });
  const callbackSourceShape = funcStateContinueWith.parameters[0].type;
  assert.equal(callbackSourceShape.kind, "function");
  assert.deepEqual(callbackSourceShape.parameters[0].type, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.Threading.Tasks.js",
    exportName: "Task",
    typeArguments: [{ kind: "type-parameter", name: "TResult" }],
  });
  assert.deepEqual(callbackSourceShape.parameters[1].type, {
    kind: "union",
    types: [{ kind: "object" }, { kind: "undefined" }],
  });
  assert.ok(
    continueWith.signatures.indexOf(funcStateContinueWith) < continueWith.signatures.indexOf(actionStateContinueWith),
    "value-returning source callback overloads must precede void Action overloads so TypeScript does not discard callback result typing",
  );
});

test(".NET reflection provider includes full type-family variants for same-module closure refs", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Threading.Tasks.js", {
    requestedExports: ["Parallel"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const task = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Task"
  );
  const taskOfT = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Task_1"
  );
  const valueTask = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "ValueTask"
  );
  const valueTaskOfT = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "ValueTask_1"
  );

  assert.deepEqual(task?.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 0,
  });
  assert.deepEqual(taskOfT?.sourceTypeFamily, {
    exportName: "Task",
    typeArgumentCount: 1,
  });
  assert.deepEqual(valueTask?.sourceTypeFamily, {
    exportName: "ValueTask",
    typeArgumentCount: 0,
  });
  assert.deepEqual(valueTaskOfT?.sourceTypeFamily, {
    exportName: "ValueTask",
    typeArgumentCount: 1,
  });

  const model = dotnetModuleToProviderDeclarationModel(module);
  const taskFamily = model.exports.filter((declaration) =>
    declaration.kind === "class" && declaration.sourceTypeFamily?.exportName === "Task"
  );
  const valueTaskFamily = model.exports.filter((declaration) =>
    declaration.kind === "class" && declaration.sourceTypeFamily?.exportName === "ValueTask"
  );
  assert.deepEqual(taskFamily.map((declaration) => declaration.sourceTypeFamily.typeArgumentCount).sort(), [0, 1]);
  assert.deepEqual(valueTaskFamily.map((declaration) => declaration.sourceTypeFamily.typeArgumentCount).sort(), [0, 1]);
});

test(".NET reflection provider exposes members on source-visible method return closure types", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.IO.js", {
    requestedExports: ["File"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const file = module.exports.find((declaration) => declaration.sourceName === "File");
  const fileStream = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "FileStream"
  );
  requireDotnetMember(file, "method", "OpenRead");
  requireDotnetMember(fileStream, "property", "Handle");
  requireDotnetMember(fileStream, "method", "Read");
  requireDotnetMember(fileStream, "method", "Flush");

  const model = dotnetModuleToProviderDeclarationModel(module);
  const sourceFile = model.exports.find((declaration) => declaration.name === "File");
  const sourceFileStream = model.exports.find((declaration) =>
    declaration.kind === "class" && declaration.name === "FileStream"
  );
  requireProviderDeclarationMember(sourceFile, "method", "OpenRead");
  requireProviderDeclarationMember(sourceFileStream, "property", "Handle");
  requireProviderDeclarationMember(sourceFileStream, "method", "Read");
  requireProviderDeclarationMember(sourceFileStream, "method", "Flush");
});

test(".NET reflection provider exposes members on source-visible returned closure types", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Net.js", {
    requestedExports: ["HttpListener"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const httpListener = module.exports.find((declaration) => declaration.sourceName === "HttpListener");
  const prefixes = module.exports.find((declaration) => declaration.sourceName === "HttpListenerPrefixCollection");
  requireDotnetMember(httpListener, "property", "Prefixes");
  requireDotnetMember(prefixes, "method", "Add");

  const model = dotnetModuleToProviderDeclarationModel(module);
  const sourceHttpListener = model.exports.find((declaration) => declaration.name === "HttpListener");
  const sourcePrefixes = model.exports.find((declaration) => declaration.name === "HttpListenerPrefixCollection");
  requireProviderDeclarationMember(sourceHttpListener, "property", "Prefixes");
  requireProviderDeclarationMember(sourcePrefixes, "method", "Add");
});

test(".NET target bindings preserve inherited source signature identity for overridden methods", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const binding = provider.findTargetBindingByMetadataName("System.IO.StreamReader");
  assert.ok(binding);
  const relations = provider.resolveTargetRelations({
    moduleSpecifier: "@tsonic/dotnet/System.IO.js",
    providerModuleId: "@tsonic/dotnet/System.IO.js",
    artifactFileName: "tsts-provider://test/System.IO.StreamReader.d.ts",
    exportName: "StreamReader",
    exportId: binding.id,
  });
  assert.equal(
    Array.isArray(relations),
    true,
    Array.isArray(relations) ? undefined : JSON.stringify(relations),
  );
  const inherited = relations.filter((relation) =>
    relation.kind === "signature" &&
    relation.memberId.includes("System.IO.StreamReader#source-member#instance#") &&
    (
      idEndsWith(relation.targetMember.id, "System.IO.StreamReader.ReadToEnd()") ||
      idEndsWith(relation.targetMember.id, "System.IO.StreamReader.Close()")
    )
  );
  assert.deepEqual(
    inherited.map((relation) => ({
      source: stripAssemblyQualifiers(relation.signatureId),
      target: stripAssemblyQualifiers(relation.targetMember.id),
    })),
    [{
      source: "System.IO.TextReader.Close()",
      target: "System.IO.StreamReader.Close()",
    }, {
      source: "System.IO.TextReader.ReadToEnd()",
      target: "System.IO.StreamReader.ReadToEnd()",
    }],
  );
});

test(".NET reflection provider exposes conflicted nested closure types through stable provider-owned source names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Collections.Generic.js", {
    requestedExports: ["Dictionary"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const dictionary = module.exports.find((declaration) => declaration.sourceName === "Dictionary");
  const valueCollection = module.exports.find((declaration) => declaration.sourceName === "Dictionary_ValueCollection");
  assert.ok(dictionary);
  assert.ok(valueCollection);
  assert.equal(valueCollection.metadataName, "System.Collections.Generic.Dictionary`2.ValueCollection");

  const values = dictionary.members?.find((member) => member.kind === "property" && member.sourceName === "Values");
  assert.ok(values);
  assert.deepEqual(values.type?.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.Collections.Generic.js",
    exportName: "Dictionary_ValueCollection",
    typeArguments: [
      { kind: "type-parameter", name: "TKey" },
      { kind: "type-parameter", name: "TValue" },
    ],
  });

  const model = dotnetModuleToProviderDeclarationModel(module);
  const sourceDictionary = model.exports.find((declaration) => declaration.name === "Dictionary");
  const sourceValueCollection = model.exports.find((declaration) => declaration.name === "Dictionary_ValueCollection");
  requireProviderDeclarationMember(sourceValueCollection, "method", "GetEnumerator");
  assert.deepEqual(
    sourceDictionary?.members?.find((member) => member.kind === "property" && member.name === "Values")?.type,
    {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.Collections.Generic.js",
      exportName: "Dictionary_ValueCollection",
      typeArguments: [
        { kind: "type-parameter", name: "TKey" },
        { kind: "type-parameter", name: "TValue" },
      ],
    },
  );
});

test(".NET provider virtual declaration slices retain same-module provider-ref closure exports", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = {
    requestedExports: ["Dictionary", "List"],
  };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.Collections.Generic.js", requestContext);
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));

  const model = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal("exports" in model, true, JSON.stringify(model));
  const exportNames = model.exports.map((declaration) => declaration.name);
  assert.deepEqual(exportNames, [
    "Dictionary",
    "List",
    "Dictionary_AlternateLookup_1",
    "Dictionary_Enumerator",
    "Dictionary_KeyCollection",
    "Dictionary_KeyCollection_Enumerator",
    "Dictionary_ValueCollection",
    "Dictionary_ValueCollection_Enumerator",
    "IComparer",
    "IDictionary",
    "IEqualityComparer",
    "IReadOnlyDictionary",
    "List_Enumerator",
  ]);

  const valueCollection = model.exports.find((declaration) => declaration.name === "Dictionary_ValueCollection");
  requireProviderDeclarationMember(valueCollection, "method", "GetEnumerator");
  const enumerator = model.exports.find((declaration) => declaration.name === "Dictionary_ValueCollection_Enumerator");
  requireProviderDeclarationMember(enumerator, "method", "MoveNext");
  requireProviderDeclarationMember(enumerator, "property", "Current");
});

test(".NET reflection provider exposes method generic parameters without confusing them for declaring type parameters", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Text.Json.js", {
    requestedExports: ["JsonSerializer"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const jsonSerializer = module.exports.find((declaration) => declaration.sourceName === "JsonSerializer");
  assert.ok(jsonSerializer);
  const genericDeserialize = jsonSerializer.members
    ?.find((member) => member.kind === "method" && member.sourceName === "Deserialize")
    ?.signatures?.find((signature) => signature.typeParameters?.some((parameter) => parameter.name === "TValue"));
  const genericSerialize = jsonSerializer.members
    ?.find((member) => member.kind === "method" && member.sourceName === "Serialize")
    ?.signatures?.find((signature) => signature.typeParameters?.some((parameter) => parameter.name === "TValue"));
  assert.ok(genericDeserialize);
  assert.ok(genericSerialize);
  assert.equal(
    jsonSerializer.unsupportedMembers?.some((member) =>
      member.sourceName === "Deserialize" &&
      member.reason.includes("declaring generic type parameter")
    ) ?? false,
    false,
  );

  const model = dotnetModuleToProviderDeclarationModel(module);
  const sourceJsonSerializer = model.exports.find((declaration) => declaration.name === "JsonSerializer");
  assert.ok(sourceJsonSerializer?.members
    ?.find((member) => member.kind === "method" && member.name === "Deserialize")
    ?.signatures?.some((signature) => signature.typeParameters?.some((parameter) => parameter.name === "TValue")));
  assert.ok(sourceJsonSerializer?.members
    ?.find((member) => member.kind === "method" && member.name === "Serialize")
    ?.signatures?.some((signature) => signature.typeParameters?.some((parameter) => parameter.name === "TValue")));
});
