import { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetTargetBindingProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture, repoRoot, testAssemblyId, testTargetId, namedDotnetTypeRef, methodMember, dotnetTestTypeMetadataName, sourcePrimitiveTestMetadataName, getDotnetDeclaration, getDotnetTargetId, getDotnetBinding, requireDotnetMember, requireProviderDeclarationMember, idEndsWith, findByIdSuffix, stripAssemblyQualifiers, collectProviderRefs, assertProviderDeclarationRefsFullyQualified, unsupportedMembersByMetadataName, constructorSignature, methodSignature, parameterFacts, stripTargetPayload, typeFact, omitLocalName, buildAttributeFixture, buildConstructorFixture, buildUnsupportedEventFixture, buildUnsupportedMemberFixture, buildConstraintFixture, buildConversionFixture, buildSignatureIdentityFixture } from "./dotnet-provider.helpers.mjs";

test(".NET reflection provider records unsupported members instead of silently dropping them", () => {
  const reference = buildUnsupportedMemberFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = provider.getModule("@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js", {});
  assert.equal("exports" in module, true);

  const typeByName = new Map(module.exports.map((declaration) => [declaration.sourceName, declaration]));
  const targetOnlyTypeByName = new Map(module.targetOnlyTypes?.map((declaration) => [declaration.sourceName, declaration]) ?? []);
  const staticInterface = typeByName.get("IStaticInterfaceMember");
  const genericHolder = typeByName.get("GenericHolder");
  const multiIndexer = typeByName.get("MultiIndexer");
  const pointerSignatures = typeByName.get("PointerSignatures");
  const rankedArraySignatures = typeByName.get("RankedArraySignatures");
  const byRefReturnSignatures = typeByName.get("ByRefReturnSignatures");
  const genericNumber = typeByName.get("GenericNumber");
  const pointerConversion = typeByName.get("PointerConversion");
  const pointerDelegate = targetOnlyTypeByName.get("PointerDelegate");
  const refReturnDelegate = targetOnlyTypeByName.get("RefReturnDelegate");
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
    "target-specific",
  ]);
  assert.equal(binding.typeParameters[0].constraints[1].name, "unsupported-constraint");
  assert.equal(binding.typeParameters[0].constraints[1].value.targetId, testTargetId("ProviderModelFixtures.PointerContract"));
  assert.deepEqual(binding.typeParameters[0].unsupportedConstraints, declaration.typeParameters[0].unsupportedConstraints);
  assert.equal(binding.implementedContracts[0].kind, "implements");
  assert.deepEqual(binding.unsupportedImplementedContracts, declaration.unsupportedImplementedContracts);
});