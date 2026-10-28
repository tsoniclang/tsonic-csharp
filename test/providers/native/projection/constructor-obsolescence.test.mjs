import assert from "node:assert/strict";
import test from "node:test";
import { validateDotnetModuleModelContract } from "../../../../dist/providers/native/model/normalization/index.js";
import { dotnetExportToTargetBinding } from "../../../../dist/providers/native/projection/binding-projection.js";
import { nativeTypeFixture } from "../../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import { testTargetId } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

function fixture(obsolete) {
  const declaration = nativeTypeFixture({
    kind: "type",
    typeKind: "class",
    sourceName: "Exact",
    namespaceName: "ConstructorEvidence",
    targetId: testTargetId("ConstructorEvidence.Exact"),
    metadataName: "ConstructorEvidence.Exact",
    isByRefLike: false,
    constraintRequiresReferenceType: true,
    allowsRefLikeTypeArguments: [],
    members: [{
      kind: "constructor",
      sourceName: "constructor",
      targetName: ".ctor",
      targetId: testTargetId("ConstructorEvidence.Exact..ctor()"),
      metadataName: "ConstructorEvidence.Exact..ctor()",
      accessibility: "protected",
      signatures: [{
        id: testTargetId("ConstructorEvidence.Exact..ctor()"),
        sourceId: testTargetId("ConstructorEvidence.Exact..ctor()"),
        ...(obsolete === undefined ? {} : { obsolete }),
        parameters: [],
      }],
    }],
  });
  return { declaration, module: { moduleSpecifier: "@fixture/ConstructorEvidence.js", namespaceName: "ConstructorEvidence", exports: [declaration] } };
}

for (const obsolete of [false, true]) {
  test(`native constructor normalization and projection preserve explicit obsolete=${obsolete}`, () => {
    const current = fixture(obsolete);
    assert.equal(validateDotnetModuleModelContract(current.module), undefined, "the exact physical signature is valid");
    const binding = dotnetExportToTargetBinding(current.declaration);
    assert.equal(binding.members[0].csharpConstructorObsolete, obsolete, "the physical relation preserves the provider fact");
    assert.equal(binding.members[0].csharpConstructorAccessibility, "protected", "obsolescence does not replace accessibility");
  });
}

for (const obsolete of [undefined, "false"]) {
  test(`native constructor normalization rejects ${obsolete === undefined ? "absent" : "nonboolean"} obsolescence evidence`, () => {
    const diagnostic = validateDotnetModuleModelContract(fixture(obsolete).module);
    assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "missing facts never become false");
    assert.equal(JSON.stringify(diagnostic.evidence).includes("obsolete"), true, "the boundary identifies the missing native fact");
  });
}
