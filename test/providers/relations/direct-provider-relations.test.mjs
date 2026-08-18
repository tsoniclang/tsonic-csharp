import {
  assert,
  providerBinding,
  providerDeclaration,
  providerMethod,
  signatureRelation,
  test,
} from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import {
  assertCsharpProviderPolicyIsNonContradictory,
  createCsharpProviderRejectionCatalog,
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
} from "../../../dist/providers/relations/index.js";

function providerRejection(source, message = "unsupported provider operation") {
  return {
    source,
    diagnostic: {
      extensionId: source.providerId,
      extensionCode: "FIXTURE_PROVIDER_OPERATION_UNSUPPORTED",
      numericCode: 9190001,
      category: "error",
      message,
    },
  };
}

test("provider relation lookup uses the complete selected signature identity", () => {
  const declaration = providerDeclaration({
    memberId: "provider.member",
    memberStatic: false,
    memberName: "same",
    signatureId: "provider.signature",
  });
  const relation = signatureRelation({
    declaration,
    member: providerMethod({
      id: "Target.Type.Member()",
      sourceName: "same",
      targetName: "DifferentTargetName",
    }),
  });
  const catalog = createCsharpProviderRelationCatalog([[relation]]);
  const identity = providerSignatureSourceIdentity(declaration);
  assert.equal(identity.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(identity.identity), [relation]);

  const differentSignature = providerSignatureSourceIdentity({
    ...declaration,
    signatureId: "provider.signature.other",
  });
  assert.equal(differentSignature.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(differentSignature.identity), []);

  const differentMember = providerSignatureSourceIdentity({
    ...declaration,
    memberId: "provider.member.other",
  });
  assert.equal(differentMember.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(differentMember.identity), []);
});

test("module-export signatures relate directly to static target methods", () => {
  const declaration = providerDeclaration({
    memberId: null,
    memberStatic: null,
    memberKey: null,
  });
  const relation = signatureRelation({
    declaration,
    member: providerMethod({ static: true }),
  });
  const catalog = createCsharpProviderRelationCatalog([[relation]]);
  const identity = providerSignatureSourceIdentity(declaration);
  assert.equal(identity.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(identity.identity), [relation]);
});

test("module-export signatures cannot select instance target methods", () => {
  const declaration = providerDeclaration({
    memberId: null,
    memberStatic: null,
    memberKey: null,
  });
  const relation = signatureRelation({
    declaration,
    member: providerMethod({ static: false }),
    receiver: { kind: "none" },
  });
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /module-export signature, or an exact static/u,
  );
});

test("same-spelling static and instance provider members remain separate", () => {
  const instanceDeclaration = providerDeclaration({
    memberId: "provider.instance",
    memberStatic: false,
    memberName: "Equals",
    signatureId: null,
  });
  const staticDeclaration = providerDeclaration({
    memberId: "provider.static",
    memberStatic: true,
    memberName: "Equals",
    signatureId: null,
  });
  const instanceIdentity = providerMemberSourceIdentity(instanceDeclaration);
  const staticIdentity = providerMemberSourceIdentity(staticDeclaration);
  assert.equal(instanceIdentity.kind, "resolved");
  assert.equal(staticIdentity.kind, "resolved");
  assert.notDeepEqual(instanceIdentity.identity, staticIdentity.identity);
});

test("one provider signature may map to multiple target candidates without ranking", () => {
  const declaration = providerDeclaration();
  const first = signatureRelation({
    declaration,
    binding: providerBinding({ id: "Target.First" }),
    member: providerMethod({
      id: "Target.First.Member()",
      declaringTypeId: "Target.First",
    }),
  });
  const second = signatureRelation({
    declaration,
    binding: providerBinding({ id: "Target.Second" }),
    member: providerMethod({
      id: "Target.Second.Member()",
      declaringTypeId: "Target.Second",
    }),
  });
  const catalog = createCsharpProviderRelationCatalog([[first], [second]]);
  const identity = providerSignatureSourceIdentity(declaration);
  assert.equal(identity.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(identity.identity), [first, second]);
});

test("provider aliases are explicit relations rather than target-name equality", () => {
  const firstDeclaration = providerDeclaration({
    memberId: "provider.alias.first",
    signatureId: "provider.alias.first.signature",
  });
  const secondDeclaration = providerDeclaration({
    memberId: "provider.alias.second",
    signatureId: "provider.alias.second.signature",
  });
  const binding = providerBinding();
  const member = providerMethod({ id: "Target.Type.Canonical()" });
  const first = signatureRelation({
    declaration: firstDeclaration,
    binding,
    member,
  });
  const second = signatureRelation({
    declaration: secondDeclaration,
    binding,
    member,
  });
  const catalog = createCsharpProviderRelationCatalog([[first, second]]);
  const firstIdentity = providerSignatureSourceIdentity(firstDeclaration);
  const secondIdentity = providerSignatureSourceIdentity(secondDeclaration);
  assert.equal(firstIdentity.kind, "resolved");
  assert.equal(secondIdentity.kind, "resolved");
  assert.deepEqual(catalog.resolveSignature(firstIdentity.identity), [first]);
  assert.deepEqual(catalog.resolveSignature(secondIdentity.identity), [second]);
});

test("provider relation slices merge deterministically and deduplicate exact repeats", () => {
  const declaration = providerDeclaration();
  const relation = signatureRelation({ declaration });
  const catalog = createCsharpProviderRelationCatalog([
    [relation],
    [{ ...relation }],
  ]);
  assert.equal(catalog.relations.length, 1);
  assert.deepEqual(catalog.relations[0], relation);
});

test("contradictory duplicate provider relations fail closed", () => {
  const declaration = providerDeclaration();
  const relation = signatureRelation({ declaration });
  const conflicting = {
    ...relation,
    targetMember: {
      ...relation.targetMember,
      targetName: "Contradictory",
    },
  };
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation, conflicting]]),
    /provider relation conflict/u,
  );
});

test("provider rejections resolve only from the complete selected identity", () => {
  const declaration = providerDeclaration();
  const identity = providerSignatureSourceIdentity(declaration);
  assert.equal(identity.kind, "resolved");
  const rejection = providerRejection(identity.identity);
  const catalog = createCsharpProviderRejectionCatalog([[rejection]]);

  assert.deepEqual(catalog.resolve(identity.identity), rejection.diagnostic);
  assert.equal(catalog.rejections.length, 1);

  const different = providerSignatureSourceIdentity({
    ...declaration,
    signatureId: "provider.signature.other",
  });
  assert.equal(different.kind, "resolved");
  assert.equal(catalog.resolve(different.identity), undefined);
});

test("provider rejection slices deduplicate exact repeats and reject conflicts", () => {
  const identity = providerSignatureSourceIdentity(providerDeclaration());
  assert.equal(identity.kind, "resolved");
  const rejection = providerRejection(identity.identity);
  const catalog = createCsharpProviderRejectionCatalog([
    [rejection],
    [{ ...rejection, diagnostic: { ...rejection.diagnostic } }],
  ]);
  assert.equal(catalog.rejections.length, 1);

  assert.throws(
    () => createCsharpProviderRejectionCatalog([[
      rejection,
      providerRejection(identity.identity, "contradictory rejection"),
    ]]),
    /provider rejection conflict/u,
  );
});

test("one exact provider identity cannot be both mapped and rejected", () => {
  const declaration = providerDeclaration();
  const identity = providerSignatureSourceIdentity(declaration);
  assert.equal(identity.kind, "resolved");
  const relationCatalog = createCsharpProviderRelationCatalog([[
    signatureRelation({ declaration }),
  ]]);
  const rejectionCatalog = createCsharpProviderRejectionCatalog([[
    providerRejection(identity.identity),
  ]]);

  assert.throws(
    () => assertCsharpProviderPolicyIsNonContradictory(
      relationCatalog,
      rejectionCatalog,
    ),
    /maps and rejects the same exact provider/u,
  );
});

test("incomplete member evidence cannot become a provider member identity", () => {
  const missingStaticness = providerMemberSourceIdentity(
    providerDeclaration({
      memberStatic: null,
      signatureId: null,
    }),
  );
  assert.equal(missingStaticness.kind, "missing");
  assert.match(missingStaticness.reason, /missing member id, staticness, or property key/u);
});

test("signature evidence with a partial member identity fails closed", () => {
  const identity = providerSignatureSourceIdentity(
    providerDeclaration({
      memberStatic: null,
    }),
  );
  assert.equal(identity.kind, "missing");
  assert.match(identity.reason, /incomplete member identity/u);
});

test("provider relations reject contradictory source and target staticness", () => {
  const declaration = providerDeclaration({ memberStatic: true });
  const relation = signatureRelation({
    declaration,
    member: providerMethod({ static: false }),
    receiver: { kind: "instance" },
  });
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /instance receiver relation contradicts source or target staticness/u,
  );
});

test("provider first-argument receiver relations require explicit target metadata", () => {
  const declaration = providerDeclaration({ memberStatic: false });
  const member = providerMethod({
    static: true,
    parameters: [{
      name: "receiver",
      type: { kind: "target-named", id: "Fixture.Target" },
      passingMode: "by-value",
    }],
  });
  const relation = signatureRelation({
    declaration,
    member,
    receiver: { kind: "target-parameter", targetParameterIndex: 0 },
    sourceParameters: [],
  });
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /exact static first-argument target receiver/u,
  );
});

test("provider parameter relations must cover each exact target slot once", () => {
  const declaration = providerDeclaration();
  const member = providerMethod({
    parameters: [{
      name: "value",
      type: { kind: "source-primitive", name: "int32" },
      passingMode: "by-value",
    }],
  });
  const relation = signatureRelation({
    declaration,
    member,
    sourceParameters: [],
  });
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /does not cover the exact target signature/u,
  );
});

test("rest and params parameter relations preserve effective omission semantics", () => {
  const declaration = providerDeclaration();
  const member = providerMethod({
    parameters: [{
      name: "values",
      type: { kind: "source-primitive", name: "string" },
      passingMode: "by-value",
      paramsArray: true,
    }],
  });
  const relation = signatureRelation({ declaration, member });
  assert.equal(relation.parameters[0].sourceRest, true);
  assert.equal(relation.parameters[0].sourceAcceptsOmission, true);
  assert.equal(relation.parameters[0].targetParamsArray, true);
  assert.equal(relation.parameters[0].targetAcceptsOmission, true);
  assert.doesNotThrow(() =>
    createCsharpProviderRelationCatalog([[relation]]));

  const contradictory = {
    ...relation,
    parameters: [{
      ...relation.parameters[0],
      targetAcceptsOmission: false,
    }],
  };
  assert.throws(
    () => createCsharpProviderRelationCatalog([[contradictory]]),
    /parameter relation is incomplete, contradictory/u,
  );
});

test("provider argument adapters require ordinary by-value parameter relations", () => {
  const declaration = providerDeclaration();
  const member = providerMethod({
    parameters: [{
      name: "value",
      type: { kind: "source-primitive", name: "int32" },
      passingMode: "byref-readwrite",
    }],
  });
  const relation = signatureRelation({
    declaration,
    member,
    sourceParameters: [{
      sourceParameterIndex: 0,
      targetParameterIndex: 0,
      sourcePassingMode: "byref-readwrite",
      targetPassingMode: "byref-readwrite",
      sourceAcceptsOmission: false,
      targetAcceptsOmission: false,
      sourceRest: false,
      targetParamsArray: false,
      argumentAdapter: {
        kind: "static-method",
        id: "System.Convert.ToInt32(System.Double)",
        declaringType: { kind: "target-named", id: "System.Convert" },
        targetName: "ToInt32",
        inputType: { kind: "source-primitive", name: "float64" },
        resultType: { kind: "source-primitive", name: "int32" },
      },
    }],
  });

  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /parameter relation is incomplete, contradictory/u,
  );
});

test("provider type-parameter relations must cover exact target arity", () => {
  const declaration = providerDeclaration();
  const binding = providerBinding({
    id: "Fixture.Target`1",
    typeParameters: [{ name: "T" }],
  });
  const relation = signatureRelation({
    declaration,
    binding,
    member: providerMethod({
      declaringType: {
        kind: "target-named",
        id: binding.id,
        typeArguments: [{ kind: "type-parameter", name: "T" }],
      },
    }),
    bindingTypeParameters: [],
  });
  assert.throws(
    () => createCsharpProviderRelationCatalog([[relation]]),
    /binding type-parameter relation does not cover the exact target arity/u,
  );
});
