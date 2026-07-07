import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetTargetBindingProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "./dotnet-provider.helpers.mjs";

test(".NET target binding provider preserves requested-export slices through declaration model loading", () => {
  const identity = {
    id: "acme.dotnet.sliced-provider",
    version: "1.2.3",
    target: "csharp",
    displayName: "Acme .NET Sliced Provider",
  };
  const observedContexts = [];
  const bindingProvider = createDotnetTargetBindingProvider({
    provider: {
      identity,
      ownsModule() {
        return { kind: "owned" };
      },
      getModule(specifier, context) {
        observedContexts.push({ specifier, context });
        return {
          moduleSpecifier: specifier,
          namespaceName: "System",
          exports: (context.requestedExports ?? []).map((sourceName) => ({
            kind: "type",
            typeKind: "class",
            sourceName,
            namespaceName: "System",
            targetId: testTargetId(`System.${sourceName}`),
            metadataName: `System.${sourceName}`,
          })),
        };
      },
    },
  });

  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", {
    requestedExports: ["Convert"],
  });
  assert.equal(resolution.kind, "virtual");
  assert.deepEqual(resolution.requestedExports, ["Convert"]);
  assert.equal(resolution.broadImport, undefined);
  assert.match(
    resolution.virtualFileName,
    /^tsts-provider:\/\/acme\.dotnet\.sliced-provider\/%40tsonic%2Fdotnet%2FSystem\.js\.d\.ts$/u,
  );

  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in model, true, JSON.stringify(model));
  assert.deepEqual(observedContexts, [{
    specifier: "@tsonic/dotnet/System.js",
    context: {
      containingFile: resolution.virtualFileName,
      requestedExports: ["Convert"],
    },
  }]);
  assert.deepEqual(model.exports.map((declaration) => declaration.name), ["Convert"]);
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
  const targetParamsConstructor = findByIdSuffix(binding.members, "ProviderConstructorFixtures.ConstructorTarget..ctor(System.Int32[])");
  const targetRefConstructor = findByIdSuffix(binding.members, "ProviderConstructorFixtures.ConstructorTarget..ctor(ref System.Int64)");
  const targetOutConstructor = findByIdSuffix(binding.members, "ProviderConstructorFixtures.ConstructorTarget..ctor(out System.Int16)");
  const targetInConstructor = findByIdSuffix(binding.members, "ProviderConstructorFixtures.ConstructorTarget..ctor(in System.Boolean,System.Char)");
  assert.ok(targetParamsConstructor);
  assert.ok(targetRefConstructor);
  assert.ok(targetOutConstructor);
  assert.ok(targetInConstructor);
  assert.deepEqual(parameterFacts(targetParamsConstructor.parameters), [
    {
      name: "values",
      type: { kind: "array", element: { kind: "source-primitive", name: "int32" } },
      passingMode: "by-value",
      paramsArray: true,
    },
  ]);
  assert.deepEqual(parameterFacts(targetRefConstructor.parameters), [
    { name: "value", type: { kind: "source-primitive", name: "int64" }, passingMode: "byref-readwrite" },
  ]);
  assert.deepEqual(parameterFacts(targetOutConstructor.parameters), [
    { name: "value", type: { kind: "source-primitive", name: "int16" }, passingMode: "byref-writeonly-must-init" },
  ]);
  assert.deepEqual(parameterFacts(targetInConstructor.parameters), [
    { name: "flag", type: { kind: "source-primitive", name: "bool" }, passingMode: "byref-readonly" },
    {
      name: "marker",
      type: { kind: "source-primitive", name: "char" },
      passingMode: "by-value",
      optional: true,
      defaultValue: { kind: "source-primitive", name: "char", value: "x" },
    },
  ]);

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
    member.sourceName === "op_Addition" &&
    member.targetName === "op_Addition"
  ));

  const specialFolder = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Environment.SpecialFolder");
  assert.equal(specialFolder.kind, "enum");
  assert.equal(requireDotnetMember(specialFolder, "field", "Desktop").static, true);

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
    member.sourceName === "Exited" &&
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
  assert.equal(process.members?.some((member) => member.name === "Exited"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.Diagnostics.js", "System.Diagnostics.Process");
  const targetExited = binding.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "Exited" &&
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
    member.sourceName === "PointerEvent" &&
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
  assert.equal(eventSource.members?.some((member) => member.name === "PointerEvent"), false);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/ProviderEventFixtures.js", "ProviderEventFixtures.EventSource");
  const targetPointerEvent = binding.members?.find((member) =>
    member.kind === "event" &&
    member.sourceName === "PointerEvent" &&
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
    member.sourceName === "Length" &&
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
    member.name === "Length" &&
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
    member.sourceName === "ForegroundColor" &&
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
  const sourceNewLine = sourceEnvironment.members?.find((member) => member.name === "NewLine");
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
  const sourceMinValue = sourceDateTime.members?.find((member) => member.name === "MinValue");
  assert.ok(sourceMinValue);
  assert.equal(sourceMinValue.readonly, true);

  const specialFolder = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Environment.SpecialFolder");
  assert.equal(specialFolder.kind, "enum");
  assert.ok(specialFolder.members.some((member) =>
    member.kind === "field" &&
    member.static === true &&
    member.sourceName === "Desktop" &&
    member.targetName === "Desktop"
  ));
});
test(".NET provider declaration model preserves static and instance CLR member identities with the same source name", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["DateTime", "DateTimeOffset"] });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const model = dotnetModuleToProviderDeclarationModel(module);
  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);

  for (const typeName of ["DateTime", "DateTimeOffset"]) {
    const declaration = model.exports.find((candidate) => candidate.name === typeName);
    assert.ok(declaration, typeName);
    const equalsMembers = declaration.members?.filter((member) => member.name === "Equals") ?? [];
    assert.equal(equalsMembers.length, 2, typeName);
    assert.equal(new Set(equalsMembers.map((member) => member.id)).size, equalsMembers.length, typeName);
    assert.deepEqual(equalsMembers.map((member) => member.static === true).sort(), [false, true], typeName);
    const rawDeclaration = module.exports.find((candidate) => candidate.sourceName === typeName);
    assert.equal(rawDeclaration?.unsupportedMembers?.some((member) =>
      member.memberKind === "method" &&
      member.sourceName === "Equals" &&
      member.static === true
    ) ?? false, false, typeName);
  }
});
test(".NET reflection provider exposes unique nested CLR types as source declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const rawEnvironment = systemModule.exports.find((declaration) => declaration.sourceName === "Environment");
  assert.ok(rawEnvironment);
  requireDotnetMember(rawEnvironment, "method", "GetFolderPath");

  const declarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const environment = declarationModel.exports.find((declaration) => declaration.name === "Environment");
  assert.ok(environment);
  assert.equal(environment.members.some((member) => member.name === "GetFolderPath"), true);
  assert.equal(environment.members.some((member) => member.name === "NewLine"), true);
  const specialFolder = declarationModel.exports.find((declaration) => declaration.name === "SpecialFolder");
  assert.ok(specialFolder);
  assert.equal(specialFolder.kind, "enum");
  assert.equal(specialFolder.members.some((member) => member.name === "Desktop"), true);

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
    moduleSpecifier: "@tsonic/dotnet/System.Text.js",
    exportName: "Encoding",
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
  assert.equal(sourceEncodingParameter?.type.sourceShape.kind, "provider-ref");
  assert.equal(sourceEncodingParameter?.type.sourceShape.moduleSpecifier, "@tsonic/dotnet/System.Text.js");
  assert.equal(sourceEncodingParameter?.type.sourceShape.exportName, "Encoding");
  assert.match(sourceEncodingParameter?.type.sourceShape.localName, /^__TsonicDotnet_Encoding_[a-z0-9]+$/u);
  assert.deepEqual(omitLocalName(sourceEncodingParameter?.type.sourceShape), {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.Text.js",
    exportName: "Encoding",
  });

  const rawMemoryStream = ioModule.exports.find((declaration) => declaration.sourceName === "MemoryStream");
  assert.deepEqual(rawMemoryStream?.baseType?.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.IO.js",
    exportName: "Stream",
  });
  const sourceMemoryStream = declarationModel.exports.find((declaration) => declaration.name === "MemoryStream");
  assert.deepEqual(sourceMemoryStream?.heritage, [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.IO.js",
      exportName: "Stream",
    },
  }]);

  const tasksModule = provider.getModule("@tsonic/dotnet/System.Threading.Tasks.js", {});
  assert.equal("exports" in tasksModule, true);
  const rawTaskCanceled = tasksModule.exports.find((declaration) => declaration.sourceName === "TaskCanceledException");
  assert.ok(rawTaskCanceled);
  assert.deepEqual(rawTaskCanceled.baseType?.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    exportName: "OperationCanceledException",
  });
  const tasksDeclarationModel = dotnetModuleToProviderDeclarationModel(tasksModule);
  const sourceTaskCanceled = tasksDeclarationModel.exports.find((declaration) => declaration.name === "TaskCanceledException");
  assert.equal(sourceTaskCanceled?.heritage?.[0]?.type.kind, "provider-ref");
  assert.equal(sourceTaskCanceled?.heritage?.[0]?.type.moduleSpecifier, "@tsonic/dotnet/System.js");
  assert.equal(sourceTaskCanceled?.heritage?.[0]?.type.exportName, "OperationCanceledException");
  assert.match(sourceTaskCanceled?.heritage?.[0]?.type.localName, /^__TsonicDotnet_OperationCanceledException_[a-z0-9]+$/u);
  assert.deepEqual(sourceTaskCanceled?.heritage?.map((heritage) => ({
    ...heritage,
    type: omitLocalName(heritage.type),
  })), [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.js",
      exportName: "OperationCanceledException",
    },
  }]);
});
test(".NET target binding provider fully qualifies every TSTS provider-ref in reflected declaration models", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const requests = [
    ["@tsonic/dotnet/System.js", ["CLSCompliantAttribute"]],
    ["@tsonic/dotnet/System.IO.js", ["BinaryReader", "MemoryStream"]],
    ["@tsonic/dotnet/System.Threading.Tasks.js", ["TaskCanceledException"]],
  ];

  for (const [moduleSpecifier, requestedExports] of requests) {
    const resolution = bindingProvider.resolveModule(moduleSpecifier, {
      containingFile: "provider-ref-regression.ts",
      requestedExports,
    });
    assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
    const model = bindingProvider.getDeclarationModel(resolution);
    assert.equal("exports" in model, true, JSON.stringify(model));
    assertProviderDeclarationRefsFullyQualified(model);
  }
});
test(".NET target binding provider qualifies CLSCompliantAttribute base provider-ref for TSTS", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", {
    containingFile: "cls-compliant-attribute-regression.ts",
    requestedExports: ["CLSCompliantAttribute"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in model, true, JSON.stringify(model));

  const clsCompliantAttribute = model.exports.find((declaration) => declaration.name === "CLSCompliantAttribute");
  assert.ok(clsCompliantAttribute);
  assert.deepEqual(clsCompliantAttribute.heritage, [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.js",
      exportName: "Attribute",
    },
  }]);
  assertProviderDeclarationRefsFullyQualified(model);
});
test(".NET provider source declarations preserve cross-module inherited overloads through heritage", () => {
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
  assert.deepEqual(typeDelegator.heritage, [{
    kind: "extends",
    type: {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.Reflection.js",
      exportName: "TypeInfo",
    },
  }]);
  assert.equal(typeDelegator.members?.some((member) => member.kind === "method" && member.name === "GetConstructors") ?? false, false);

  const typeInfo = declarationModel.exports.find((declaration) => declaration.name === "TypeInfo");
  assert.ok(typeInfo);
  assert.equal(typeInfo.heritage?.[0]?.kind, "extends");
  assert.equal(typeInfo.heritage?.[0]?.type.kind, "provider-ref");
  assert.equal(typeInfo.heritage?.[0]?.type.moduleSpecifier, "@tsonic/dotnet/System.js");
  assert.equal(typeInfo.heritage?.[0]?.type.exportName, "Type");
  assert.equal(typeof typeInfo.heritage?.[0]?.type.localName, "string");
  assertProviderDeclarationRefsFullyQualified(declarationModel);
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