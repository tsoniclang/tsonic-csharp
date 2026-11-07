import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { selectCsharpSourceProfileElementPolicy } from "../../../dist/analysis/operations/source-profiles/policy-selection.js";
import { csharpJsRegExpElementPolicies } from "../../../dist/policy/operations/source-profiles/js/regexp.js";
import { csharpJsArrayElementPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType, csharpJsStringTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { unrepresentedCsharpCarrier } from "../../helpers/planning-records.mjs";

// The Host element-access record (facts.values.elementAccess) names the selected member or index signature; the
// profile identity of that declaration (jsSourceApiIdentity over provider facts) selects the policy.
function fixture(options = {}) {
  const receiver = {};
  const argument = {};
  const access = {};
  const sourceDeclaration = {};
  const receiverType = { kind: "declared", declaration: {}, typeArguments: [] };
  const selected = options.missingDeclarations ? { kind: "string-character" }
    : options.index ? { kind: "index-signature", declaration: sourceDeclaration }
    : { kind: "member", declaration: sourceDeclaration, name: "0" };
  const record = { node: access, receiver, receiverType, index: { kind: "primitive", primitive: "int32" }, selected,
    result: { kind: "string" }, readonly: options.readonly === true, access: "read" };
  const host = {
    facts: {
      values: { elementAccess: node => node === access ? record : assert.fail("only the selected access is read") },
      selections: { wellKnownSymbol: () => undefined },
      // A non-union receiver: no per-arm relation at the access, so the element record's declaration is the indexer.
      relations: { at: () => undefined },
    },
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    projectTypes: { directSupertypes: () => [] },
    ast: { kindName: () => options.index ? "KindIndexSignature" : "KindPropertySignature",
      is: { IsSpreadElement: () => false },
      as: { AsElementAccessExpression: node => node === access ? { ArgumentExpression: argument } : undefined },
      getSourceFile: () => ({}), getFileName: () => "/project/foreign.ts", parent: () => undefined },
    sourceFacts: { getFact: (subject, key) => key === providerVirtualDeclarationFactKey && subject === sourceDeclaration ? {
        providerId: options.foreign ? "foreign-provider" : jsSourceSemanticsIdentity.providerId,
        exportName: options.owner ?? "RegExpExecArray",
        memberName: options.wrongName ? "1" : "0",
      } : undefined },
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

test("existing source array index policies still require their exact index declaration", () => {
  const selected = select({ index: true, owner: "Array" }, csharpJsArrayElementPolicies);
  assert.equal(selected?.kind, "resolved");
  assert.equal(selected.targetMember.returnType.id, csharpStringTargetType().id);
  for (const options of [{ missingDeclarations: true }, { foreign: true }]) {
    assert.equal(select({ ...options, index: true, owner: "Array" }, csharpJsArrayElementPolicies) === undefined, true);
  }
});
