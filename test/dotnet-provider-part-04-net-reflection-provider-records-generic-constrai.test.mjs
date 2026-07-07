import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetTargetBindingProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "./dotnet-provider.helpers.mjs";

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
  const sourceCopy = sourceReferenceNewTarget.members.find((member) => member.kind === "method" && member.name === "Copy");
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
            sourceName: "Item",
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
test(".NET provider source declarations keep TS-compatible numeric indexers and omit incompatible string indexers", () => {
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
  assert.equal(indexers.length, 1);
  assert.equal(indexers.some((member) =>
    member.signatures[0].parameters[0].type.kind === "string"
  ), false);
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
test(".NET reflection provider preserves declaring generic type parameters in member type refs", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Span"] });
  assert.equal("exports" in systemModule, true);

  const rawSpan = systemModule.exports.find((declaration) => declaration.sourceName === "Span");
  assert.ok(rawSpan);
  const rawSlice = rawSpan.members
    .find((member) => member.sourceName === "Slice" && member.signatures?.some((signature) => signature.parameters.length === 2));
  const rawSliceSignature = rawSlice?.signatures.find((signature) => signature.parameters.length === 2);
  assert.deepEqual(rawSliceSignature?.returnType?.typeArguments, [{ kind: "type-parameter", name: "T" }]);

  const binding = getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Span`1");
  const targetSlice = binding.members
    ?.find((member) => member.sourceName === "Slice" && member.parameters.length === 2);
  assert.deepEqual(targetSlice?.returnType?.typeArguments, [{ kind: "type-parameter", name: "T" }]);
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
test(".NET provider source declarations preserve Constructor property casing without colliding with constructor syntax", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const reflectionModule = provider.getModule("@tsonic/dotnet/System.Reflection.js", {});
  assert.equal("exports" in reflectionModule, true);

  const rawCustomAttributeData = reflectionModule.exports.find((declaration) => declaration.sourceName === "CustomAttributeData");
  assert.ok(rawCustomAttributeData);
  assert.ok(rawCustomAttributeData.members.some((member) =>
    member.kind === "property" &&
    member.sourceName === "Constructor" &&
    member.targetName === "Constructor"
  ));

  const declarationModel = dotnetModuleToProviderDeclarationModel(reflectionModule);
  const customAttributeData = declarationModel.exports.find((declaration) => declaration.name === "CustomAttributeData");
  assert.ok(customAttributeData);
  assert.equal(customAttributeData.members.some((member) => member.kind === "property" && member.name === "Constructor"), true);
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
  assert.doesNotMatch(JSON.stringify(stripTargetPayload(preAllocatedOverlapped)), /IOCompletionCallback/);
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
  assert.deepEqual(targetBinding?.csharpType.csharpDelegateSignature, {
    parameters: [{ kind: "type-parameter", name: "T" }],
    returnType: { kind: "source-primitive", name: "bool" },
  });
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

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceTarget = sourceModel.exports.find((declaration) => declaration.name === "SignatureTarget");
  assert.ok(sourceTarget);
  const sourceM = sourceTarget.members.find((member) => member.name === "M");
  assert.ok(sourceM);
  assert.deepEqual(sourceM.signatures.map((signature) => stripAssemblyQualifiers(signature.id)), [
    "ProviderSignatureFixtures.SignatureTarget.M(System.Int32)",
    "ProviderSignatureFixtures.SignatureTarget.M(ref System.Int32)",
  ]);
  assert.deepEqual(sourceM.signatures.map((signature) => signature.parameters[0].passingMode), [
    undefined,
    "byref-readwrite",
  ]);

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
  const sourceOptionalDefaults = methodSignature(sourceTarget, "OptionalDefaults", optionalDefaultsId);
  const sourceParamsRest = methodSignature(sourceTarget, "ParamsRest", paramsRestId);
  const sourceByRefModes = methodSignature(sourceTarget, "ByRefModes", byRefModesId);
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
  const sourceTransform = sourceTarget.members.find((member) => member.kind === "method" && member.name === "Transform");
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
test(".NET reflection provider disambiguates conflicted nested type families without silently dropping them", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  assert.equal(systemModule.unsupportedExports?.some((declaration) => declaration.sourceName === "Enumerator") ?? false, false);
  const arraySegmentEnumerator = systemModule.exports.find((declaration) =>
    declaration.sourceName === "ArraySegment_Enumerator" &&
    declaration.metadataName === "System.ArraySegment`1.Enumerator"
  );
  const spanEnumerator = systemModule.exports.find((declaration) =>
    declaration.sourceName === "Span_Enumerator" &&
    declaration.metadataName === "System.Span`1.Enumerator"
  );
  assert.ok(arraySegmentEnumerator);
  assert.ok(spanEnumerator);

  assert.ok(systemModule.exports.some((declaration) => declaration.sourceName === "Action_1" && declaration.kind === "type"));
  assert.ok(systemModule.exports.some((declaration) => declaration.sourceName === "Func_2" && declaration.kind === "type"));
  assert.equal(getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Action`1")?.kind, "delegate");
  assert.equal(getDotnetBinding(provider, "@tsonic/dotnet/System.js", "System.Func`2")?.kind, "delegate");
});
test(".NET reflection provider exposes requested conflicted nested type-family target IDs through qualified source names", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = provider.getModule("@tsonic/dotnet/System.js", {
    requestedMetadataNames: ["System.Span`1.Enumerator"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  assert.equal(module.exports.some((declaration) => declaration.sourceName === "Enumerator"), false);
  assert.equal(module.unsupportedExports?.some((declaration) => declaration.sourceName === "Enumerator") ?? false, false);
  const spanEnumerator = module.exports.find((declaration) =>
    declaration.sourceName === "Span_Enumerator" &&
    declaration.metadataName === "System.Span`1.Enumerator"
  );
  assert.ok(spanEnumerator);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  assert.equal(sourceModel.exports.some((declaration) => declaration.name === "Enumerator"), false);
  assert.equal(sourceModel.exports.some((declaration) => declaration.name === "Span_Enumerator"), true);

  const bindingProvider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const binding = bindingProvider.findTargetBindingByMetadataName("System.Span`1.Enumerator");
  assert.ok(binding);
  assert.equal(binding.kind, "struct");
  assert.equal(binding.sourceName, "Span_Enumerator");
});
test(".NET reflection provider keeps requested unsupported source exports target-only", () => {
  const reference = buildUnsupportedMemberFixture();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [reference],
  });
  const module = provider.getModule("@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js", {
    requestedMetadataNames: ["ProviderUnsupportedMemberFixtures.PointerDelegate"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  assert.equal(module.exports.some((declaration) => declaration.sourceName === "PointerDelegate"), false);
  const targetOnlyPointerDelegate = module.targetOnlyTypes?.find((declaration) =>
    declaration.metadataName === "ProviderUnsupportedMemberFixtures.PointerDelegate"
  );
  assert.ok(targetOnlyPointerDelegate);
  assert.equal(targetOnlyPointerDelegate.typeKind, "delegate");

  const unsupportedPointerDelegate = module.unsupportedExports?.find((declaration) =>
    declaration.kind === "unsupported-type-export" &&
    declaration.sourceName === "PointerDelegate"
  );
  assert.ok(unsupportedPointerDelegate);
  assert.match(unsupportedPointerDelegate.reason, /Delegate invoke signature/u);
  assert.match(unsupportedPointerDelegate.reason, /System\.Int32\*/u);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  assert.equal(sourceModel.exports.some((declaration) => declaration.name === "PointerDelegate"), false);

  const bindingProvider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [reference],
  });
  const binding = bindingProvider.findTargetBindingByMetadataName("ProviderUnsupportedMemberFixtures.PointerDelegate");
  assert.ok(binding);
  assert.equal(binding.kind, "delegate");
  assert.equal(binding.sourceName, "PointerDelegate");
  assert.equal(binding.csharpType.csharpDelegateSignature, undefined);
});