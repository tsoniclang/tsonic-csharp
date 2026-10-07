import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { selectCsharpSourceProfileElementPolicy } from "../../../dist/policy/operations/source-profiles/source-profile-policy.js";
import { csharpJsRegExpElementPolicies } from "../../../dist/policy/operations/source-profiles/js/regexp.js";
import { csharpJsArrayElementPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType, csharpJsStringTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";

function fixture(options = {}) {
  const sourceFile = {};
  const sourceType = {};
  const receiver = {};
  const propertySymbol = {};
  const rootSymbol = {};
  const sourceDeclaration = {};
  const alternativeDeclaration = {};
  const property = { symbol: propertySymbol, rootSymbols: [rootSymbol], name: "0", type: {}, optional: false,
    readonly: options.readonly === true };
  const index = { declaration: options.missingDeclarations ? undefined : sourceDeclaration,
    components: [], readonly: options.readonly === true };
  const member = options.index ? { kind: "index", index } : { kind: "property", property };
  const source = { receiver: { expression: receiver, type: sourceType }, argument: { expression: {}, type: {} },
    expression: {}, selectedDeclaration: sourceDeclaration, selectedSymbol: propertySymbol,
    writable: !options.readonly, accessMode: "read", optionalChain: false };
  const declarations = options.missingDeclarations ? [] : [sourceDeclaration];
  const semantics = {
    declarations: {
      rootSymbols: symbol => symbol === propertySymbol ? [rootSymbol] : [],
      symbolDeclarations: symbol => symbol === propertySymbol ? declarations
        : symbol === rootSymbol && options.ambiguousOwner ? [alternativeDeclaration] : [],
    },
    types: {
      selectIndexedAccess: () => options.unresolved ? { kind: "deferred" }
        : { kind: "resolved", objectType: sourceType, indexType: source.argument.type,
          members: options.multiple ? [member, member] : [member] },
      propertyInfos: () => options.stale ? [{ ...property, symbol: {}, rootSymbols: [] }] : [property],
    },
  };
  const host = {
    semantics: () => semantics,
    ast: { kindName: () => options.index ? "KindIndexSignature" : "KindPropertySignature",
      getSourceFile: () => sourceFile, getFileName: () => "/project/foreign.ts", parent: () => undefined },
    sourceFacts: { getFact: (subject, key) => key === providerVirtualDeclarationFactKey
      && (subject === sourceDeclaration || subject === alternativeDeclaration) ? {
        providerId: options.foreign ? "foreign-provider" : jsSourceSemanticsIdentity.providerId,
        exportName: subject === alternativeDeclaration ? "RegExpMatchArray" : options.owner ?? "RegExpExecArray",
        memberName: options.wrongName ? "1" : "0",
      } : undefined },
    types: { nativeFlowTypes: () => options.emptyFlow ? [] : undefined,
      resolveSelectedValue: () => csharpJsArrayTargetType(csharpStringTargetType()) },
  };
  return { host, source, sourceFile };
}

function select(options = {}, policies = csharpJsRegExpElementPolicies) {
  const current = fixture(options);
  return selectCsharpSourceProfileElementPolicy(current.host, current.source, current.sourceFile, policies);
}

test("literal RegExp result elements consume their exact checked property declaration", () => {
  for (const owner of ["RegExpExecArray", "RegExpMatchArray", "JsRegExpExecArray", "JsRegExpMatchArray"]) {
    const selected = select({ owner });
    assert.equal(selected?.kind, "resolved", owner);
    const element = owner.startsWith("Js") ? csharpJsStringTargetType() : csharpStringTargetType();
    assert.equal(selected.targetMember.returnType.id, element.id, owner);
    assert.equal(selected.invocation.kind, "indexer", owner);
    assert.equal(selected.targetParameterIndex, 0, owner);
  }
});

test("literal element policy retains checker-selected readonly property evidence", () => {
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

test("literal element policy rejects absent, stale, foreign and ambiguous property provenance", () => {
  for (const [label, options] of [
    ["missing declarations", { missingDeclarations: true }],
    ["stale selected property", { stale: true }],
    ["foreign ownership", { foreign: true }],
    ["ambiguous ownership", { ambiguousOwner: true }],
    ["wrong member", { wrongName: true }],
    ["deferred type", { unresolved: true }],
    ["multiple members", { multiple: true }],
    ["unreachable flow", { emptyFlow: true }],
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
