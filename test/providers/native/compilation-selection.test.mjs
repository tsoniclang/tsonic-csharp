import { resolvedNativeBinding } from "../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";
import { providerDeclaration } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { csharpProviderPolicyContribution } from "../../../dist/public/provider.js";
import { providerTypeSourceIdentity } from "../../../dist/providers/model/provider-relations.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";

test("source relations acquire their undeclared physical binding once from the actual native owner", () => {
  for (const order of ["source-first", "metadata-first"]) {
    const declaration = providerDeclaration({ providerId: "fixture.source-facade" });
    const source = providerTypeSourceIdentity(declaration).identity;
    const reference = { id: "Fixture.Exception", target: "csharp", kind: "class", sourceName: "Exception",
      targetName: "Fixture.Exception", csharpType: csharpTargetNamedType("Fixture.Exception", undefined,
        csharpQualifiedTypeRenderShape("Fixture", "Exception"), { allowsRefLikeTypeArguments: [] }) };
    const physical = snapshotCsharpMetadata({ ...reference, id: "Actual.Native.Owner::Fixture.Exception",
      csharpType: { ...reference.csharpType, id: "Actual.Native.Owner::Fixture.Exception" } });
    let reads = 0;
    const native = {
      identity: { id: "fixture.native-owner", version: "1.0.0" }, validateReferences: () => undefined,
      findTargetBindingByMetadataName(name, purpose) {
        assert.equal(name, "Fixture.Exception", `${order}: the declared canonical reference selects its native metadata query`);
        assert.equal(purpose, "ordinary", `${order}: native type ownership does not require runtime preparation`);
        reads += 1;
        return { kind: "resolved", binding: physical };
      },
      findTargetBindingByTargetId: () => assert.fail("a metadata-only source reference has no fabricated assembly target ID"),
    };
    const contribution = csharpProviderPolicyContribution({ providerId: source.providerId,
      providerVersion: source.providerVersion, targetBindings: [], rejections: [], relations: [
        { kind: "type", source, targetBinding: reference, bindingTypeParameters: [] },
      ] });
    const resolver = createCsharpProviderRelationResolver({ providers: [native], providerPolicies: [contribution] });
    if (order === "metadata-first") {
      const acquired = resolver.findTargetBindingByMetadataName("Fixture.Exception", "ordinary");
      assert.equal(acquired.kind === "resolved" && acquired.binding === physical, true,
        "a source relation's canonical reference is not a competing complete native definition");
    }
    const selected = resolver.resolveType(declaration);
    assert.equal(selected.kind === "resolved" && selected.relations.length === 1 &&
      selected.relations[0].targetBinding === physical, true, `${order}: the native owner supplies the actual complete binding by identity`);
    assert.equal(resolver.resolveType(declaration) === selected, true, `${order}: source selection is immutable and computed once`);
    const acquired = resolver.findTargetBindingByMetadataName("Fixture.Exception", "ordinary");
    assert.equal(acquired.kind === "resolved" && acquired.binding === physical, true,
      `${order}: subsequent native queries retain that identical authoritative object`);
    assert.equal(reads, 1, `${order}: one native acquisition, no retry, first-provider choice or canonical-ID substitute`);
  }
});

test("a source reference with no physical owner cannot publish its canonical carrier as native evidence", () => {
  const declaration = providerDeclaration({ providerId: "fixture.unowned-facade" });
  const source = providerTypeSourceIdentity(declaration).identity;
  const reference = { id: "Fixture.Missing", targetName: "Fixture.Missing", sourceName: "Missing",
    target: "csharp", kind: "class", csharpType: csharpTargetNamedType("Fixture.Missing", undefined,
      csharpQualifiedTypeRenderShape("Fixture", "Missing"), { allowsRefLikeTypeArguments: [] }) };
  const contribution = csharpProviderPolicyContribution({ providerId: source.providerId,
    providerVersion: source.providerVersion, targetBindings: [], rejections: [], relations: [
      { kind: "type", source, targetBinding: reference, bindingTypeParameters: [] },
    ] });
  const resolver = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution] });
  const result = resolver.resolveType(declaration);
  assert.equal(result.kind, "missing", "the unavailable actual native type is not replaced with its source reference");
  assert.equal(result.reason, "A source provider relation requires its exact physical binding from the declared native owner.",
    "the missing complete owner is reported at source relation admission");
  assert.equal(resolver.findTargetBindingByMetadataName("Fixture.Missing", "ordinary").kind, "missing",
    "a relation does not populate the physical metadata inventory");
});

test("a source relation cannot hide a contradictory declared physical binding", () => {
  const declaration = providerDeclaration({ providerId: "fixture.owned-facade" });
  const source = providerTypeSourceIdentity(declaration).identity;
  const binding = { id: "Fixture.Owned", targetName: "Fixture.Owned", sourceName: "Owned", target: "csharp", kind: "class" };
  const contribution = csharpProviderPolicyContribution({ providerId: source.providerId,
    providerVersion: source.providerVersion, targetBindings: [binding], rejections: [], relations: [
      { kind: "type", source, targetBinding: { ...binding, kind: "interface" }, bindingTypeParameters: [] },
    ] });
  const resolver = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution] });
  const result = resolver.resolveType(declaration);
  assert.equal(result.kind, "rejected", "the complete declared physical owner and source relation must agree");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT",
    "genuine physical contradictions retain the existing single conflict owner");
  assert.equal(result.diagnostic.message, "C# providers supplied contradictory complete target binding evidence.",
    "the complete original contradiction diagnostic is unchanged");
});

test("compilation selection reuses exact immutable facts, not spelling or partial identities", () => {
  const requests = [];
  const provider = {
    identity: { id: "fixture-provider", version: "1.0.0" },
    validateReferences: () => undefined,
    resolveTargetRelations(request) { requests.push(request); return []; },
  };
  const resolver = createCsharpProviderRelationResolver({ providers: [provider], providerPolicies: [] });
  const declaration = providerDeclaration();
  const result = resolver.resolveType(declaration);
  for (let index = 0; index < 1000; index += 1) assert.strictEqual(resolver.resolveType(declaration), result);
  assert.equal(requests.length, 1);
  for (const method of ["resolveValue", "resolveMember", "resolveSignature"]) {
    const selected = resolver[method](declaration);
    assert.strictEqual(resolver[method](declaration), selected);
  }
  assert.equal(requests.length, 4);
  for (const field of ["exportId", "exportName", "memberId", "signatureId", "artifactFileName", "providerModuleId", "moduleSpecifier"]) {
    resolver.resolveType(providerDeclaration({ [field]: "different" }));
  }
  assert.equal(requests.length, 11);
  assert.equal(resolver.resolveType(providerDeclaration({ providerVersion: "2.0.0" })).kind, "missing");
  const separate = createCsharpProviderRelationResolver({ providers: [provider], providerPolicies: [] });
  separate.resolveType(declaration);
  assert.equal(requests.length, 12);
  assert.deepEqual(resolver.validateReferences(), []);
});

test("compilation reference validation retains the reflection provider's actual mutation guard", () => {
  const root = createTestWorkspace(new URL("../../../.temp/reference-integrity/", import.meta.url).pathname, "selection-");
  const reference = join(root, "Evidence.dll");
  writeFileSync(reference, "first");
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const resolver = createCsharpProviderRelationResolver({ providers: [provider], providerPolicies: [] });
  assert.deepEqual(resolver.validateReferences(), []);
  writeFileSync(reference, "other");
  const diagnostics = resolver.validateReferences();
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].extensionCode, "DOTNET_REFLECTION_REFERENCES_MUTATED");
  assert.match(diagnostics[0].message, /reference assemblies changed/u);
});

test("physical target bindings share the exact native relation catalog without inventing source declarations", () => {
  const binding = {
    id: "Fixture.IWritable",
    sourceName: "IWritable",
    targetName: "Fixture.IWritable",
    target: "csharp",
    kind: "interface",
    csharpType: { kind: "target-named", id: "Fixture.IWritable", csharpAllowsRefLikeTypeArguments: [] },
  };
  const contribution = targetBindings => csharpProviderPolicyContribution({ providerId: "fixture.physical", providerVersion: "1", targetBindings, relations: [], rejections: [] });
  const resolver = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution([binding])] });
  assert.equal(resolvedNativeBinding(resolver.findTargetBindingByTargetId(binding.id, "ordinary"))?.kind, "interface");
  assert.equal(resolvedNativeBinding(resolver.findTargetBindingByMetadataName(binding.targetName, "ordinary"))?.id, binding.id);
  assert.equal(resolver.findTargetBindingByTargetId("Fixture.Other", "ordinary").kind, "missing");
  assert.equal(resolver.resolveType(providerDeclaration({ providerId: "fixture.physical", providerVersion: "1" })).kind, "resolved");
  assert.equal(resolver.resolveType(providerDeclaration({ providerId: "fixture.physical", providerVersion: "1" })).relations.length, 0);
  const equal = Object.fromEntries(Object.entries(binding).reverse());
  assert.doesNotThrow(() => createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution([binding, equal])] }), "identical native identity independent of object field order");
  const contradictory = createCsharpProviderRelationResolver({ providers: [],
    providerPolicies: [contribution([binding, { ...binding, kind: "class" }])] });
  for (const [method, query] of [["findTargetBindingByTargetId", binding.id], ["findTargetBindingByMetadataName", binding.targetName]]) {
    const rejected = contradictory[method](query, "ordinary");
    assert.equal(rejected.kind, "rejected", `${method}: contradictory physical identity is refused before analysis`);
    assert.equal(rejected.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT", `${method}: exact conflict owner`);
    assert.equal(rejected.diagnostic.message, "C# providers supplied contradictory complete target binding evidence.",
      `${method}: the complete original native conflict reason is retained`);
  }
});
