import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { providerIndexedPolicyFixture } from "../../../../tsonic/test/fixtures/provider-indexed-policy.mjs";
import { resolveCsharpProviderIndexedAccess } from "../../../dist/policy/types/resolution/indexed-access.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { directProviderHost, memberRelation, providerBinding, providerDeclaration, providerField } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

const integer = { kind: "source-primitive", name: "int64" };

function fixture(options = {}) {
  const selected = providerIndexedPolicyFixture(options.keys);
  const binding = providerBinding({ id: "Native.Box", typeParameters: [{ name: "T" }] });
  const facts = new Map();
  const relations = selected.evidence.properties.map((member, index) => {
    const declaration = providerDeclaration({ signatureId: null, memberId: `field-${index}` });
    if (!options.missingFact || index === 0) for (const subject of member.subjects) facts.set(subject, declaration);
    return memberRelation({ declaration, binding, member: providerField({
      id: `Native.Box.Field${index}`, returnType: options.conflicting && index === 1
        ? { kind: "source-primitive", name: "uint64" } : { kind: "type-parameter", name: "T" },
    }) });
  });
  const direct = directProviderHost({ relations: options.missingRelation ? [] :
    options.duplicate ? [...relations, { ...relations[0], targetMember: { ...relations[0].targetMember, id: "other" } }] : relations });
  const scope = {
    host: { ...direct.host, ast: selected.source.ast, sourceFacts: {
      getFact: (subject, key) => key === providerVirtualDeclarationFactKey && !options.unowned ? facts.get(subject) : undefined,
    } },
    resolveNodeWithState: () => ({ kind: "target-named", id: options.wrongOwner ? "Native.Other" : binding.id,
      typeArguments: options.missingGeneric ? [] : [integer] }),
  };
  return resolveCsharpProviderIndexedAccess(scope, selected.node, selected.semantics, { depth: 0 });
}

test("provider indexed type policy closes native generics and optional properties", () => {
  assert.deepEqual(fixture(), integer);
  assert.deepEqual(fixture({ keys: '"value" | "other"' }), integer);
  assert.deepEqual(fixture({ keys: '"optional"' }), csharpNullableTargetType(integer));
  assert.equal(fixture({ unowned: true }), undefined);
});

test("provider indexed type policy rejects incomplete, ambiguous and mismatched evidence", () => {
  for (const options of [
    { missingRelation: true }, { duplicate: true }, { wrongOwner: true }, { missingGeneric: true },
    { keys: '"value" | "other"', conflicting: true }, { keys: '"value" | "other"', missingFact: true },
  ]) assert.deepEqual(fixture(options), { kind: "opaque", id: "provider-indexed-type-evidence-unavailable" }, JSON.stringify(options));
});
