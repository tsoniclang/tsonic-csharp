import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProviderPolicyContribution } from "../../../dist/public/provider.js";
import { providerTypeSourceIdentity } from "../../../dist/providers/model/provider-relations.js";
import { providerDeclaration } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpRuntimeUnionTargetType,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpProgramErrorCarrier } from "../../../dist/policy/conversions/program-error.js";
import { selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/expression.js";
import { csharpErrorSourceProfilePropertyPolicies, csharpErrorSourceProfileCallPolicies }
  from "../../../dist/policy/operations/source-profiles/error-source-profile.js";

function fixture() {
  const exception = csharpExceptionTargetType();
  const source = csharpRuntimeErrorTargetType();
  const physicalException = { ...exception, id: "PhysicalOwner::Exception" };
  const physicalSource = { ...source, id: "RuntimeOwner::Error", csharpBaseType: physicalException };
  const binding = type => ({ id: type.id, target: "csharp", kind: "class", sourceName: type.id,
    targetName: type === exception || type === physicalException ? "System.Exception" : "Tsonic.CSharp.Runtime.Error", csharpType: type });
  const declaration = providerDeclaration({ providerId: "fixture.source-error", exportId: "NodeError", exportName: "NodeError" });
  const policy = csharpProviderPolicyContribution({ providerId: declaration.providerId, providerVersion: declaration.providerVersion,
    targetBindings: [], rejections: [], relations: [{ kind: "type", source: providerTypeSourceIdentity(declaration).identity,
      targetBinding: binding(exception), bindingTypeParameters: [] }] });
  const reads = new Map();
  const providers = createCsharpProviderRelationResolver({ providerPolicies: [policy], providers: [{
    identity: { id: "fixture.native", version: "1" }, validateReferences: () => undefined,
    findTargetBindingByMetadataName(name) {
      reads.set(name, (reads.get(name) ?? 0) + 1);
      const type = name === "System.Exception" ? physicalException : name === "Tsonic.CSharp.Runtime.Error" ? physicalSource : undefined;
      return type === undefined ? { kind: "missing" } : { kind: "resolved", binding: binding(type) };
    },
    findTargetBindingByTargetId: () => ({ kind: "missing" }),
  }] });
  return { exception, source, physicalException, physicalSource, declaration, providers, reads };
}

test("source-profile peers and foreign provider relations publish one physical native Error identity in either order", () => {
  for (const order of ["source-first", "provider-first"]) {
    const input = fixture();
    const { providers, exception, source, physicalException, physicalSource, declaration } = input;
    if (order === "provider-first") assert.equal(providers.resolveType(declaration).kind, "resolved");
    const selected = providers.publishNativeIdentities({ exception, source });
    assert.equal(selected.kind, "resolved", `${order}: both source peers acquire native metadata before publication`);
    const imported = providers.resolveType(declaration);
    assert.equal(imported.kind, "resolved", "the readonly imported source relation remains present");
    assert.equal(targetTypeRefEquals(imported.relations[0].targetBinding.csharpType, selected.value.exception), true,
      "source Error and imported NodeError have the exact same physical identity, not a conversion alias");
    assert.equal(targetTypeRefEquals(selected.value.exception, physicalException) &&
      targetTypeRefEquals(selected.value.source, physicalSource) &&
      targetTypeRefEquals(selected.value.source.csharpBaseType, physicalException), true,
    "construction and inherited source Error carry the native owner's complete physical base chain");
    const host = { providers, projectTypes: { directSupertypes: () => [] }, target: {} };
    assert.equal(selectCsharpConversion(host, selected.value.exception, imported.relations[0].targetBinding.csharpType, "implicit").kind,
      "identity", "readonly source Error to NodeError has zero conversion work");
    assert.equal(selectCsharpConversion(host, imported.relations[0].targetBinding.csharpType, selected.value.exception, "implicit").kind,
      "identity", "the reverse readonly view has zero conversion work");
    const constructed = selectCsharpConversion(host, selected.value.source, selected.value.exception, "implicit");
    assert.equal(constructed.kind === "implicit" && constructed.proof === "reference", true,
      "a constructed runtime Error converts through its actual native base");
    const union = csharpRuntimeUnionTargetType([selected.value.exception, selected.value.source]);
    assert.equal(targetTypeRefEquals(selectCsharpProgramErrorCarrier(host, union, false), selected.value.exception), true,
      "program-error selection consumes the same physical Exception owner");
    assert.equal(selectCsharpFlowReadConversion(host, selected.value.exception, selected.value.source, true).kind,
      "cast", "checked native throwable flow reads compare the physical owner rather than the symbolic template");
    for (const policy of csharpErrorSourceProfilePropertyPolicies.filter(policy => policy.source.name === "message")) {
      const selectedProperty = policy.select({ host, source: { accessMode: "read" }, receiverType: selected.value.exception });
      assert.equal(selectedProperty.kind, "resolved", "the readonly native Error observation remains admitted");
      assert.equal(selectedProperty.targetMember.id, "System.Exception.Message", "readonly Message keeps its existing native member");
      assert.equal(targetTypeRefEquals(selectedProperty.targetMember.declaringType, selected.value.exception), true,
        "the property contract uses that same physical native owner");
      assert.equal(policy.select({ host, source: { accessMode: "write" }, receiverType: selected.value.exception }).kind,
        "rejected", "native readonly Error storage still rejects source mutation");
      const writable = policy.select({ host, source: { accessMode: "write" }, receiverType: selected.value.source });
      assert.equal(writable.kind, "resolved", "the actual writable native Error hierarchy retains its setter");
      assert.equal(targetTypeRefEquals(writable.targetMember.declaringType, selected.value.source), true,
        "the setter keeps the exact metadata-published writable Error identity");
      const immutable = { ...physicalException, id: "PhysicalOwner::InvalidOperationException", csharpBaseType: physicalException };
      assert.equal(policy.select({ host, source: { accessMode: "read" }, receiverType: immutable }).kind, "resolved",
        "a genuine native Exception subtype retains its readonly observation contract");
      assert.equal(policy.select({ host, source: { accessMode: "write" }, receiverType: immutable }).kind, "rejected",
        "not-exactly-Exception is never proof of writable source Error storage");
      assert.equal(policy.select({ host, source: { accessMode: "write" },
        receiverType: { ...physicalException, id: "PhysicalOwner::Unrelated", csharpBaseType: undefined } }).kind, "rejected",
      "a foreign same-shaped native identity cannot acquire source Error setters");
    }
    const constructor = csharpErrorSourceProfileCallPolicies.find(policy => policy.source.kind === "construct" &&
      policy.source.owner === "csharp" && policy.source.declaringName === "ErrorConstructor").inheritableConstructor;
    const inherited = providers.publishNativeIdentities(constructor);
    assert.equal(inherited.kind === "resolved" && targetTypeRefEquals(inherited.value.declaringType, selected.value.source) &&
      targetTypeRefEquals(inherited.value.returnType, selected.value.source), true,
    "the inherited constructor and ordinary construction publish one physical source Error contract");
    assert.equal(input.reads.get("System.Exception"), 1, "all peers and consumers acquire Exception metadata once");
    assert.equal(input.reads.get("Tsonic.CSharp.Runtime.Error"), 1, "all peers and consumers acquire runtime Error metadata once");
  }
});

test("missing physical source Error ownership never publishes a canonical substitute", () => {
  const providers = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] });
  const selected = providers.publishNativeIdentities(csharpExceptionTargetType());
  assert.equal(selected.kind, "rejected", "a missing native owner rejects before source carriers are published");
  assert.equal(providers.failures().length, 1, "the physical owner records its one exact source rejection");
});
