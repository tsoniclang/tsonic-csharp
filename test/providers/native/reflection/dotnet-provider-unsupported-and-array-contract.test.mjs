import { assert, mkdirSync, writeFileSync, dirname, join, test, fileURLToPath, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetModuleToProviderDeclarationModel, dotnetNativeArrayTypeId, validateDotnetModuleModelContract, validateDotnetProviderDeclarationModelContract, buildDotnetFixture, repoRoot, testAssemblyId, supportedPassingModes, testTargetId, hasEvidencePath, assertRawModuleContractInvariants, assertProviderDeclarationContractInvariants, assertTargetBindingContractInvariants, assertRawSignatureInvariant, assertTypeParameterInvariant, assertDotnetTypeRefInvariant, assertProviderTypeExpressionInvariant, assertAssemblyReference, assertTargetIdentity, walkDotnetTypeDeclarationRefs, walkDotnetTypeRef, walkProviderExportRefs, walkProviderTypeExpression, rawType, rawMethod, sourceType, sourceMember, rawConstructor, rawIndexer, idHasShape, stripAssemblyQualifiers, escapeRegExp, buildConstraintFixture, buildSignatureIdentityFixture, buildUnsupportedMemberFixture, buildAttributeFixture, buildUnsupportedDefaultParameterFixture } from "../../../fixtures/dotnet-provider/dotnet-provider-contract.helpers.mjs";

import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

test(".NET provider preserves exact pointer attribute and unsupported default-value facts", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [
      buildAttributeFixture(),
      buildUnsupportedDefaultParameterFixture(),
    ],
  });

  const attributeModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderAttributeFixtures.js", {});
  assert.equal("exports" in attributeModule, true, JSON.stringify(attributeModule));
  assert.equal(validateDotnetModuleModelContract(attributeModule), undefined);
  const unsupportedAttributeTarget = rawType(attributeModule, "UnsupportedAttributeTarget");
  const pointerAttribute = unsupportedAttributeTarget.attributes?.find((attribute) =>
    idHasShape(attribute.constructorId, "ProviderAttributeFixtures.TypeOnlyAttribute..ctor(System.Type)")
  );
  assert.ok(pointerAttribute);
  assert.equal(pointerAttribute.target, "type");
  assert.deepEqual(pointerAttribute.arguments?.[0], {
    kind: "constructor",
    value: {
      kind: "type",
      type: {
        kind: "pointer",
        pointee: { kind: "source-primitive", name: "int32" },
        mutability: "mut",
      },
    },
  });
  assert.equal(unsupportedAttributeTarget.unsupportedAttributes, undefined);
  const attributeBinding = provider.findTargetBindingByTargetId(unsupportedAttributeTarget.targetId);
  assert.ok(attributeBinding);
  assert.ok(attributeBinding.attributes?.some((attribute) =>
    attribute.id === pointerAttribute.id &&
    attribute.target === pointerAttribute.target
  ));

  const defaultModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderUnsupportedDefaultFixtures.js", {});
  assert.equal("exports" in defaultModule, true, JSON.stringify(defaultModule));
  assert.equal(validateDotnetModuleModelContract(defaultModule), undefined);
  const unsupportedDefaultSource = rawType(defaultModule, "UnsupportedDefaultParameterSource");
  const rawSignature = rawMethod(
    unsupportedDefaultSource,
    "UnsupportedDateTimeDefault",
    "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource.UnsupportedDateTimeDefault(System.DateTime)",
  ).signatures[0];
  const rawParameter = rawSignature.parameters[0];
  assert.equal(rawParameter.optional, true);
  assert.equal(rawParameter.defaultValue, undefined);
  assert.equal(rawParameter.unsupportedDefaultValue.kind, "unsupported-default-value");
  assert.equal(rawParameter.unsupportedDefaultValue.parameterName, "value");
  assert.match(rawParameter.unsupportedDefaultValue.reason, /System\.DateTime/u);

  const sourceModel = dotnetModuleToProviderDeclarationModel(defaultModule);
  assert.equal(validateDotnetProviderDeclarationModelContract(sourceModel), undefined);
  const sourceDefaultType = sourceModel.exports.find((declaration) => declaration.name === "UnsupportedDefaultParameterSource");
  const sourceSignature = sourceDefaultType?.members?.find((member) => member.name === "UnsupportedDateTimeDefault")?.signatures?.[0];
  assert.ok(sourceSignature);
  assert.equal(sourceSignature.parameters[0].optional, true);
  assert.equal("defaultValue" in sourceSignature.parameters[0], false);
  assert.equal("unsupportedDefaultValue" in sourceSignature.parameters[0], false);

  const defaultBinding = provider.findTargetBindingByTargetId(unsupportedDefaultSource.targetId);
  assert.ok(defaultBinding);
  const targetSignature = defaultBinding.members
    ?.find((member) => idHasShape(member.id, "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource.UnsupportedDateTimeDefault(System.DateTime)"));
  assert.ok(targetSignature);
  assert.deepEqual(targetSignature.parameters[0].unsupportedDefaultValue, rawParameter.unsupportedDefaultValue);
});
test(".NET synthetic native array target binding is discoverable by provider target id", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const binding = provider.findTargetBindingByTargetId(dotnetNativeArrayTypeId);
  assert.ok(binding);
  assert.equal(binding.id, dotnetNativeArrayTypeId);
  assert.equal(binding.sourceName, "Array");
});
