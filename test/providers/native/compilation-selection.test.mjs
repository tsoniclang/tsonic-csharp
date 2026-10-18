import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations.js";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";
import { providerDeclaration } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { csharpProviderPolicyContribution } from "../../../dist/public/provider.js";

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
  assert.equal(resolver.findTargetBindingByTargetId(binding.id)?.kind, "interface");
  assert.equal(resolver.findTargetBindingByMetadataName(binding.targetName)?.id, binding.id);
  assert.equal(resolver.findTargetBindingByTargetId("Fixture.Other"), undefined);
  assert.equal(resolver.resolveType(providerDeclaration({ providerId: "fixture.physical", providerVersion: "1" })).kind, "resolved");
  assert.equal(resolver.resolveType(providerDeclaration({ providerId: "fixture.physical", providerVersion: "1" })).relations.length, 0);
  const equal = Object.fromEntries(Object.entries(binding).reverse());
  assert.doesNotThrow(() => createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution([binding, equal])] }), "identical native identity independent of object field order");
  assert.throws(
    () => createCsharpProviderRelationResolver({ providers: [], providerPolicies: [contribution([binding, { ...binding, kind: "class" }])] }),
    { message: "C# provider relation contributions define incompatible target binding 'Fixture.IWritable'." },
    "contradictory physical identity is refused before analysis",
  );
});
