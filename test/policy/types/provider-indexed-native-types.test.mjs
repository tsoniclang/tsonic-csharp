import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { providerIndexedPolicyFixture } from "../../../../tsonic/test/fixtures/provider-indexed-policy.mjs";
import { resolveCsharpProviderIndexedAccess } from "../../../dist/policy/types/resolution/indexed-access.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { directProviderHost, memberRelation, signatureRelation, providerBinding, providerDeclaration, providerField } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

const integer = { kind: "source-primitive", name: "int64" };

function fixture(options = {}) {
  const selected = providerIndexedPolicyFixture(options.keys);
  const binding = providerBinding({ id: "Native.Box", typeParameters: [{ identity: "T", name: "T" }] });
  const facts = new Map();
  const relations = selected.evidence.members.map((member, index) => {
    const declaration = providerDeclaration({ signatureId: member.selection.kind === "index" ? `index-${index}` : null, memberId: `field-${index}` });
    if (!options.missingFact || index === 0) for (const subject of member.subjects) facts.set(subject, options.wrongSignature
      ? { ...declaration, signatureId: "wrong-signature" } : declaration);
    const relation = member.selection.kind === "index" ? signatureRelation : memberRelation;
    return relation({ declaration, binding, member: { ...providerField({
      id: `Native.Box.Field${index}`, returnType: options.conflicting && index === 1
        ? { kind: "source-primitive", name: "uint64" } : options.nativeOptional
          ? csharpNullableTargetType({ kind: "type-parameter", identity: "T", name: "T" })
          : { kind: "type-parameter", identity: "T", name: "T" },
    }), ...(member.selection.kind === "index" ? { kind: options.wrongKind ? "method" : "indexer" } : {}) } });
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
  assert.deepEqual(fixture({ keys: '"optional"', nativeOptional: true }), csharpNullableTargetType(integer));
  assert.deepEqual(fixture({ nativeOptional: true }), csharpNullableTargetType(integer));
  assert.deepEqual(fixture({ keys: "string", nativeOptional: true }), csharpNullableTargetType(integer));
  assert.equal(fixture({ unowned: true }), undefined);
});

test("provider indexed type policy rejects incomplete, ambiguous and mismatched evidence", () => {
  for (const options of [
    { missingRelation: true }, { duplicate: true }, { wrongOwner: true }, { missingGeneric: true },
    { keys: '"value" | "other"', conflicting: true }, { keys: '"value" | "other"', missingFact: true },
    { keys: "string", missingRelation: true }, { keys: "string", duplicate: true },
    { keys: "string", wrongOwner: true }, { keys: "string", missingGeneric: true },
    { keys: "string", wrongSignature: true }, { keys: "string", wrongKind: true },
  ]) assert.deepEqual(fixture(options), { kind: "opaque", id: "provider-indexed-type-evidence-unavailable" }, JSON.stringify(options));
});
