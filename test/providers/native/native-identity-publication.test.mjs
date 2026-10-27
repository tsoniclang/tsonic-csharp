import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { createCsharpProviderIdentityPublication } from "../../../dist/providers/native/projection/native-identity-publication.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";
import { csharpProviderPolicyContribution } from "../../../dist/public/provider.js";
import { providerTypeSourceIdentity } from "../../../dist/providers/model/provider-relations.js";
import { providerDeclaration, signatureRelation } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { csharpTargetNamedType, csharpQualifiedTypeRenderShape, csharpDelegateTargetType, csharpVoidTargetType,
  csharpNullableTargetType, getCsharpNullableElementTargetType, getCsharpDelegateSignature,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

function fixture() {
  const reference = { id: "Fixture.Exception", target: "csharp", kind: "class", sourceName: "Exception",
    targetName: "Fixture.Exception", csharpType: csharpTargetNamedType("Fixture.Exception", undefined,
      csharpQualifiedTypeRenderShape("Fixture", "Exception"), { allowsRefLikeTypeArguments: [] }) };
  const physical = snapshotCsharpMetadata({ ...reference, id: "Actual.Native.Owner::Fixture.Exception",
    csharpType: { ...reference.csharpType, id: "Actual.Native.Owner::Fixture.Exception" } });
  return { reference, physical };
}

test("native identity publication closes owned member and nested callback carriers regardless of source query order", () => {
  for (const order of ["member-first", "type-first"]) {
    const { reference, physical } = fixture();
    const error = providerDeclaration({ providerId: "fixture.graph", exportId: "Error", exportName: "Error" });
    const member = providerDeclaration({ providerId: "fixture.graph", exportId: "Holder", exportName: "Holder" });
    const holder = { id: "Fixture.Holder", target: "csharp", kind: "class", sourceName: "Holder", targetName: "Fixture.Holder",
      csharpType: csharpTargetNamedType("Fixture.Holder", undefined, csharpQualifiedTypeRenderShape("Fixture", "Holder"),
        { allowsRefLikeTypeArguments: [] }) };
    const absent = csharpNullableTargetType(reference.csharpType);
    const callback = csharpDelegateTargetType("System.Func", [absent], reference.csharpType);
    holder.members = [{ id: "Fixture.Holder.callback", sourceName: "callback", targetName: "callback", kind: "method",
      parameters: [{ name: "callback", type: callback, passingMode: "by-value" }], returnType: csharpVoidTargetType() }];
    const policy = csharpProviderPolicyContribution({ providerId: error.providerId, providerVersion: error.providerVersion,
      targetBindings: [holder], rejections: [], relations: [
        { kind: "type", source: providerTypeSourceIdentity(error).identity, targetBinding: reference, bindingTypeParameters: [] },
        signatureRelation({ declaration: member, binding: holder,
          member: { id: "Fixture.Holder.forward", sourceName: "forward", targetName: "forward", kind: "method",
            declaringType: holder.csharpType,
            parameters: [{ name: "error", type: absent, passingMode: "by-value" },
              { name: "callback", type: callback, passingMode: "by-value" }], returnType: reference.csharpType } }),
      ] });
    let reads = 0;
    const resolver = createCsharpProviderRelationResolver({ providerPolicies: [policy], providers: [{
      identity: { id: "fixture.native", version: "1" }, validateReferences: () => undefined,
      findTargetBindingByMetadataName(name) {
        assert.equal(name, "Fixture.Exception", "the sole exact metadata owner is queried");
        reads += 1;
        return { kind: "resolved", binding: physical };
      },
      findTargetBindingByTargetId: () => ({ kind: "missing" }),
    }] });
    if (order === "type-first") assert.equal(resolver.resolveType(error).kind, "resolved", "the standalone source type is acquired first");
    const selected = resolver.resolveSignature(member);
    assert.equal(selected.kind, "resolved", "a genuinely owned member retains its exact source relation");
    const native = selected.relations[0].targetMember;
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(native.parameters[0].type), physical.csharpType), true,
      "an ordinary member parameter uses the same acquired identity as the standalone source type");
    const signature = getCsharpDelegateSignature(native.parameters[1].type);
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(signature.parameters[0]), physical.csharpType), true,
      "the nested callback parameter preserves both actual identity and native absence");
    assert.equal(targetTypeRefEquals(signature.returnType, physical.csharpType) && targetTypeRefEquals(native.returnType, physical.csharpType), true,
      "member and callback results have the same complete native identity");
    assert.equal(resolver.resolveType(error).relations[0].targetBinding === physical, true, "the actual native owner object remains authoritative");
    assert.equal(resolver.resolveSignature(member) === selected, true, "the completed source relation is computed once");
    const acquiredHolder = resolver.findTargetBindingByTargetId(holder.id, "ordinary");
    assert.equal(acquiredHolder.kind, "resolved", "the genuinely owned physical inventory remains available");
    assert.equal(getCsharpDelegateSignature(acquiredHolder.binding.members[0].parameters[0].type).returnType.id,
      physical.csharpType.id, "public physical binding lookup publishes the same closed nested native identity");
    assert.equal(resolver.findTargetBindingByTargetId(holder.id, "ordinary") === acquiredHolder, true,
      "ordinary physical publication is immutable and computed once");
    assert.equal(reads, 1, `${order}: the full carrier graph requires one actual native acquisition`);
  }
});

test("native publication closes the complete data graph without erasing ownership, absence or shared evidence", () => {
  const { reference, physical } = fixture();
  let reads = 0;
  const publish = createCsharpProviderIdentityPublication([reference], () => {
    reads += 1;
    return { kind: "resolved", binding: physical };
  });
  const callback = csharpDelegateTargetType("System.Action", [csharpNullableTargetType(reference.csharpType)]);
  const shared = { kind: "tuple", elements: [reference.csharpType, { kind: "array", element: callback }] };
  const graph = { first: shared, second: shared, invocation: { factoryType: reference.csharpType },
    attribute: { type: reference.csharpType, namedArguments: [{ type: reference.csharpType }] },
    typeParameter: { identity: "T", csharpAllowsRefLike: false,
      constraints: [{ kind: "implements", contract: reference.csharpType }] },
    pointer: { kind: "pointer", pointee: reference.csharpType, mutability: "const" } };
  const result = publish(graph);
  assert.equal(result.kind, "resolved", "complete immutable metadata is published only after identity closure");
  const output = result.value;
  assert.equal(output.first === output.second && Object.isFrozen(output.first), true, "shared evidence is neither split nor mutable");
  assert.equal(output.first.elements[0].id === physical.csharpType.id &&
    getCsharpNullableElementTargetType(getCsharpDelegateSignature(output.first.elements[1].element).parameters[0]).id === physical.csharpType.id,
  true, "tuple, array and nullable callback positions all migrate");
  assert.equal(output.invocation.factoryType.id === physical.csharpType.id && output.attribute.type.id === physical.csharpType.id &&
    output.attribute.namedArguments[0].type.id === physical.csharpType.id &&
    output.typeParameter.constraints[0].contract.id === physical.csharpType.id && output.pointer.pointee.id === physical.csharpType.id,
  true, "all carrier-bearing metadata positions consume the same native answer");
  assert.equal(output.typeParameter.csharpAllowsRefLike, false, "native generic permission is not invented or widened");
  assert.equal(reads, 1, "the native identity is selected once for the entire graph");
});

test("missing C# generic permission evidence is refused rather than asserted or defaulted", () => {
  const { reference, physical } = fixture();
  for (const typeParameters of [[{ identity: "T", name: "T" }], undefined]) {
    const malformed = typeParameters === undefined ? { ...physical, members: [{ id: "bad", sourceName: "bad", targetName: "bad",
      kind: "method", parameters: [], returnType: csharpVoidTargetType(), typeParameters: [{ identity: "M", name: "M" }] }] }
      : { ...physical, typeParameters };
    const publish = createCsharpProviderIdentityPublication([reference], () => ({ kind: "resolved", binding: malformed }));
    const result = publish({ parameter: reference.csharpType });
    assert.equal(result.kind, "missing", "unproved binding or member permissions cannot enter a sealed source relation");
    assert.equal(result.reason, "A source provider carrier requires its complete named C# native binding and generic parameter permissions.",
      "the exact missing native evidence is reported without a cast or false permission");
  }
});

test("native graph publication never evaluates accessors or publishes an unresolved inner carrier", () => {
  const { reference } = fixture();
  const publish = createCsharpProviderIdentityPublication([reference], () => ({ kind: "missing" }));
  let reads = 0;
  assert.throws(() => publish({ get kind() { reads += 1; return "target-named"; } }), TypeError,
    "executable metadata is refused before projection reads it");
  assert.equal(reads, 0, "an invalid metadata accessor is not invoked");
  const result = publish({ returnType: csharpDelegateTargetType("System.Func", [], reference.csharpType) });
  assert.equal(result.kind, "missing", "a nested callback missing its native owner publishes no partial canonical relation");
});

test("native publication snapshots all mutable containers even when no identity changes", () => {
  const publish = createCsharpProviderIdentityPublication([], () => ({ kind: "missing" }));
  const shared = { name: "before" };
  const input = { items: [shared], other: shared };
  const result = publish(input);
  assert.equal(result.kind, "resolved", "no replacement is required for ordinary metadata publication");
  assert.equal(result.value !== input && result.value.items !== input.items && result.value.other !== shared, true,
    "unchanged mutable records and arrays are owning snapshots rather than caller aliases");
  assert.equal(result.value.items[0] === result.value.other && Object.isFrozen(result.value) &&
    Object.isFrozen(result.value.items) && Object.isFrozen(result.value.other), true,
  "the snapshot preserves shared-child identity and freezes every retained container");
  shared.name = "after";
  input.items.push({ name: "new" });
  assert.equal(result.value.other.name, "before", "mutating retained caller records cannot change published evidence");
  assert.equal(result.value.items.length, 1, "mutating retained caller arrays cannot change published evidence");
  assert.equal(Object.isFrozen(input) || Object.isFrozen(input.items) || Object.isFrozen(shared), false,
    "publication never freezes caller-owned input as a shortcut");
  const immutable = snapshotCsharpMetadata({ items: [{ name: "stable" }] });
  assert.equal(publish(immutable).value === immutable, true, "already deeply immutable authority remains shared");
  const shallow = Object.freeze({ items: [{ name: "mutable child" }] });
  assert.equal(publish(shallow).value !== shallow, true, "a frozen outer record does not certify its descendants");
});

test("a changed native graph snapshots untouched mutable children and retains graph validation", () => {
  const { reference, physical } = fixture();
  let acquisitions = 0;
  const publish = createCsharpProviderIdentityPublication([reference], () => {
    acquisitions += 1;
    return { kind: "resolved", binding: physical };
  });
  const untouched = { items: ["before"] };
  const result = publish({ type: reference.csharpType, first: untouched, second: untouched });
  assert.equal(result.kind, "resolved", "physical identity publication completes before the handoff");
  assert.equal(result.value.type.id, physical.csharpType.id, "the actual native identity is retained");
  assert.equal(result.value.first === result.value.second && result.value.first !== untouched &&
    Object.isFrozen(result.value.first) && Object.isFrozen(result.value.first.items), true,
  "an unrelated mutable child is snapshotted once, not shared or split");
  untouched.items[0] = "after";
  assert.equal(result.value.first.items[0], "before", "unchanged metadata cannot mutate after publication");
  assert.equal(acquisitions, 1, "copying never re-acquires native identity");
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => publish(cycle), { name: "TypeError", message: "C# immutable metadata contains a cycle." });
  assert.throws(() => publish([, "hole"]), TypeError, "sparse metadata arrays remain rejected");
  assert.throws(() => snapshotCsharpMetadata({ item: 1 }, undefined, { reserve() { throw new TypeError("budget"); } }, value => value),
    { name: "TypeError", message: "budget" }, "projection never bypasses the owning resource budget");
});

test("native publication preserves exact authored generic argument property presence", () => {
  const { reference, physical } = fixture();
  const publish = createCsharpProviderIdentityPublication([reference], () => ({ kind: "resolved", binding: physical }));
  const absent = publish(reference.csharpType);
  assert.equal(absent.kind, "resolved", "ordinary nongeneric native identity is published");
  assert.equal(Object.hasOwn(absent.value, "typeArguments"), Object.hasOwn(reference.csharpType, "typeArguments"),
    "absence does not become an extra undefined metadata field");
  for (const typeArguments of [undefined, []]) {
    const selected = publish({ ...reference.csharpType, typeArguments });
    assert.equal(selected.kind === "resolved" && Object.hasOwn(selected.value, "typeArguments"), true,
      "an explicitly supplied generic argument property is retained");
    assert.equal(typeArguments === undefined ? selected.value.typeArguments === undefined
      : selected.value.typeArguments.length === typeArguments.length, true, "the supplied native argument vector is unchanged");
  }
});
