import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { createJsSourceApiFacts, jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { selectCsharpSourceProfileElementPolicy } from "../../../dist/analysis/operations/source-profiles/policy-selection.js";
import { csharpJsRegExpElementPolicies } from "../../../dist/policy/operations/source-profiles/js/regexp.js";
import { csharpJsArrayElementPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType, csharpJsStringTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { unrepresentedCsharpCarrier } from "../../helpers/planning-records.mjs";

// The Host element-access record (facts.values.elementAccess) names the selected member or index signature; the
// profile identity of that declaration (facts.profile.identity, the real JS API profile over the fixture's provider
// facts, FX-CC #42 / D18) selects the policy. A union receiver's per-arm relation (facts.relations.at) names the
// declaration each arm selects; every arm must match the one policy.
function fixture(options = {}) {
  const receiver = {};
  const argument = {};
  const access = {};
  const sourceDeclaration = {};
  // Per-arm declarations (options.arms: [{ owner, name }] or undefined for an arm without a selected member).
  const armDeclarations = (options.arms ?? []).map(arm => arm === undefined ? undefined : { arm });
  const receiverType = { kind: "declared", declaration: {}, typeArguments: [] };
  const selected = options.missingDeclarations ? { kind: "string-character" }
    : options.undeclaredElement ? { kind: "element" }
    : options.index ? { kind: "index-signature", declaration: sourceDeclaration }
    : { kind: "member", declaration: sourceDeclaration, name: "0" };
  const record = { node: access, receiver, receiverType, index: { kind: "primitive", primitive: "int32" }, selected,
    result: { kind: "string" }, readonly: options.readonly === true, access: "read" };
  const relation = options.refusedRelation
    ? { kind: "refused", code: "TSONIC_LOCAL_TYPE_UNION", site: access, message: "fixture refusal" }
    : options.arms === undefined ? undefined
    : { kind: "per-arm", use: access, sum: {}, arms: armDeclarations.map((member, arm) => ({ arm, member })) };
  const providerFact = subject => {
    if (subject === sourceDeclaration) return { providerId: options.foreign ? "foreign-provider" : jsSourceSemanticsIdentity.providerId,
      exportName: options.owner ?? "RegExpExecArray", memberName: options.wrongName ? "1" : "0" };
    const arm = armDeclarations.find(candidate => candidate === subject)?.arm;
    return arm === undefined ? undefined
      : { providerId: jsSourceSemanticsIdentity.providerId, exportName: arm.owner, memberName: arm.name };
  };
  const ast = { kindName: () => options.index ? "KindIndexSignature" : "KindPropertySignature",
    is: { IsSpreadElement: () => false },
    as: { AsElementAccessExpression: node => node === access ? { ArgumentExpression: argument } : undefined },
    getSourceFile: () => ({}), getFileName: () => "/project/foreign.ts", parent: () => undefined };
  const sourceFacts = { getFact: (subject, key) => key === providerVirtualDeclarationFactKey ? providerFact(subject) : undefined };
  const host = {
    facts: {
      values: { elementAccess: node => node === access ? record : assert.fail("only the selected access is read") },
      selections: { wellKnownSymbol: () => undefined },
      // A non-union receiver has no per-arm relation at the access, so the element record's declaration is the indexer.
      relations: { at: node => node === access ? relation : undefined },
      // FX-CC #42 (D18), W2-T-5: the JS API identity is the Host profile fact, built by the real profile.
      profile: createJsSourceApiFacts({ ast, sourceFacts, wellKnownSymbol: () => undefined,
        presentArms: type => [type], typeofCategory: () => undefined }),
    },
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    projectTypes: { directSupertypes: () => [] },
    ast,
    sourceFacts,
    types: {
      value: node => node === receiver ? csharpJsArrayTargetType(csharpStringTargetType())
        : node === argument ? { kind: "source-primitive", name: "int32" } : unrepresentedCsharpCarrier(node),
      represent: (_type, site) => unrepresentedCsharpCarrier(site),
    },
  };
  return { host, access };
}

function select(options = {}, policies = csharpJsRegExpElementPolicies) {
  const current = fixture(options);
  return selectCsharpSourceProfileElementPolicy(current.host, current.access, policies);
}

test("literal RegExp result elements consume their exact Host-selected property declaration", () => {
  for (const owner of ["RegExpExecArray", "RegExpMatchArray", "JsRegExpExecArray", "JsRegExpMatchArray"]) {
    const selected = select({ owner });
    assert.equal(selected?.kind, "resolved", owner);
    const element = owner.startsWith("Js") ? csharpJsStringTargetType() : csharpStringTargetType();
    assert.equal(selected.targetMember.returnType.id, element.id, owner);
    assert.equal(selected.invocation.kind, "indexer", owner);
    assert.equal(selected.targetParameterIndex, 0, owner);
  }
});

test("literal element policy retains the Host-published readonly element evidence", () => {
  for (const readonly of [false, true]) {
    let observed;
    const policies = csharpJsRegExpElementPolicies.map(policy => ({ ...policy, select: context => {
      observed = context.readonly;
      return policy.select(context);
    } }));
    assert.equal(select({ readonly }, policies)?.kind, "resolved");
    assert.equal(observed, readonly);
  }
});

test("literal element policy rejects absent, foreign and wrong property provenance", () => {
  for (const [label, options] of [
    ["missing declarations", { missingDeclarations: true }],
    ["foreign ownership", { foreign: true }],
    ["wrong member", { wrongName: true }],
  ]) assert.equal(select(options) === undefined, true, label);
});

// Q107 (TEST-REVIEW-RC2-ITEM7 row source-profile-element-provenance:80): the old ambiguous-owner and multiple-member
// negatives, at the current authority. A union receiver's arms each name their selected declaration (Host per-arm
// relation); arms that select declarations of different owners, or an arm with no selected member, have no one
// current authoritative member, so no policy lowers the access. Two arms of the one owner and member still resolve.
test("literal element policy lowers a union receiver only when every Host arm selects the one policy member", () => {
  const exec = { owner: "RegExpExecArray", name: "0" };
  const selected = select({ arms: [exec, { ...exec }] });
  assert.equal(selected?.kind, "resolved", "two arms naming the one owner's member select its policy");
  assert.equal(selected.targetMember.returnType.id, csharpStringTargetType().id);
  for (const [label, arms] of [
    ["ambiguous ownership", [exec, { owner: "RegExpMatchArray", name: "0" }]],
    ["multiple selected members", [exec, { owner: "RegExpExecArray", name: "1" }]],
    ["an arm without a selected member", [exec, undefined]],
    ["a foreign-owned arm", [exec, { owner: "Array", name: "0" }]],
  ]) assert.equal(select({ arms }) === undefined, true, label);
});

// Q107 (same row): the old deferred-indexed-access negative. An unresolved element selection is a Host refusal
// (local-type-flow/program-facts.ts elementSelection); C# lowers nothing for an element record that names no
// indexer declaration, and a refused relation at an analyzed access is an invariant failure, never a lowering.
test("literal element policy lowers no unresolved or refused Host element selection", () => {
  assert.equal(select({ undeclaredElement: true }) === undefined, true, "an element record without its indexer declaration");
  assert.throws(() => select({ refusedRelation: true }), /Host refusal at a node C# analyzed/u,
    "a refused per-arm relation is forwarded by the Host, never lowered by C#");
});

test("existing source array index policies still require their exact index declaration", () => {
  const selected = select({ index: true, owner: "Array" }, csharpJsArrayElementPolicies);
  assert.equal(selected?.kind, "resolved");
  assert.equal(selected.targetMember.returnType.id, csharpStringTargetType().id);
  for (const options of [{ missingDeclarations: true }, { foreign: true }]) {
    assert.equal(select({ ...options, index: true, owner: "Array" }, csharpJsArrayElementPolicies) === undefined, true);
  }
});
