import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceUnionIndex } from "../../../../dist/analysis/source-evidence/types/resolution/source-unions.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/index.js";

test("source union evidence preserves generic bindings and rejects ambiguous native members", () => {
  const parameter = { declaration: {} };
  const wide = {};
  const text = {};
  const foreign = {};
  const queries = {
    declarations: { typeSymbol: type => type.declaration === undefined ? undefined : type,
      primarySymbolDeclaration: symbol => symbol.declaration },
    types: { isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
      isNumberLike: type => type.domain === "number", isBigIntLike: type => type.domain === "bigint",
      aliasApplication: () => undefined, couldContainTypeVariables: type => type.declaration !== undefined,
      stringLiteralValue: () => undefined,
      booleanLiteralValue: () => undefined, numericLiteralValue: () => undefined,
      isIdentical: (left, right) => left === right },
  };
  const integer = csharpSourcePrimitiveTargetType("uint64");
  const string = csharpStringTargetType();
  const carrier = csharpRuntimeUnionTargetType([integer, string]);
  const index = createCsharpSourceUnionIndex();
  assert.equal(index.select(carrier, wide, queries).kind, "unavailable");
  const sourceBindings = new Map([[parameter.declaration, { sourceType: wide, targetType: integer }]]);
  assert.equal(index.retain(carrier, [{ source: parameter, carrier: integer }, { source: text, carrier: string }],
    queries, { depth: 0, sourceBindings }), carrier);
  sourceBindings.clear();
  assert.deepEqual(index.select(carrier, wide, queries), { kind: "resolved", carrier: integer });
  assert.deepEqual(index.select(carrier, text, queries), { kind: "resolved", carrier: string });
  assert.equal(index.select(carrier, foreign, queries).kind, "rejected");
  const signed = csharpSourcePrimitiveTargetType("int64");
  const ambiguous = csharpRuntimeUnionTargetType([integer, signed]);
  index.retain(ambiguous, [{ source: wide, carrier: integer }, { source: wide, carrier: signed }], queries, { depth: 0 });
  assert.equal(index.select(ambiguous, wide, queries).kind, "rejected");
  const outer = csharpRuntimeUnionTargetType([carrier, signed]);
  index.retain(outer, [{ source: {}, carrier }, { source: foreign, carrier: signed }], queries, { depth: 0 });
  assert.deepEqual(index.select(outer, wide, queries), { kind: "resolved", carrier: integer });
  assert.deepEqual(index.select(outer, foreign, queries), { kind: "resolved", carrier: signed });
});

test("checked numeric source domains disambiguate native widths without using implicit conversions", () => {
  const number = { domain: "number" };
  const bigint = { domain: "bigint" };
  const floating = csharpSourcePrimitiveTargetType("float64");
  const wide = { kind: "target-named", id: "System.Numerics.BigInteger", csharpAllowsRefLikeTypeArguments: [] };
  const queries = { declarations: { typeSymbol: () => undefined }, types: {
    isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
    aliasApplication: () => undefined, couldContainTypeVariables: () => false,
    stringLiteralValue: () => undefined, booleanLiteralValue: () => undefined,
    isIdentical: (left, right) => left === right,
    isNumberLike: type => type.domain === "number", isBigIntLike: type => type.domain === "bigint",
  } };
  const index = createCsharpSourceUnionIndex();
  const carrier = csharpRuntimeUnionTargetType([floating, wide]);
  index.retain(carrier, [{ source: number, carrier: floating }, { source: bigint, carrier: wide }], queries, { depth: 0 });
  assert.equal(index.select(carrier, { domain: "number" }, queries).carrier === floating, true,
    "a distinct checked native numeric type retains its number source branch");
  assert.equal(index.select(carrier, { domain: "bigint" }, queries).carrier === wide, true,
    "a checked native wide integer retains its bigint source branch without a floating round trip");
  assert.equal(index.select(carrier, {}, queries).kind, "rejected", "unknown source correspondence stays rejected");
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const ambiguous = csharpRuntimeUnionTargetType([floating, narrow]);
  const exactNumber = { domain: "number" };
  index.retain(ambiguous, [{ source: exactNumber, carrier: floating }, { source: { domain: "number" }, carrier: narrow }],
    queries, { depth: 0 });
  assert.equal(index.select(ambiguous, { domain: "number" }, queries).kind, "rejected",
    "a checked category cannot choose between different native payloads within that category");
  assert.equal(index.select(ambiguous, exactNumber, queries).carrier === floating, true,
    "exact checked identity remains more specific than a numeric category");
});

test("array contributions cannot replace a checked union arm with their preconversion physical carrier", () => {
  const numberType = { domain: "number" };
  const narrowType = { domain: "number" };
  const bigintType = { domain: "bigint" };
  const wideType = { domain: "bigint" };
  const floating = csharpSourcePrimitiveTargetType("float64");
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const wide = { kind: "target-named", id: "System.Numerics.BigInteger", csharpAllowsRefLikeTypeArguments: [] };
  const nativeWide = csharpSourcePrimitiveTargetType("int64");
  const queries = { declarations: { typeSymbol: () => undefined }, types: {
    isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
    aliasApplication: () => undefined, couldContainTypeVariables: () => false,
    stringLiteralValue: () => undefined, booleanLiteralValue: () => undefined,
    isIdentical: (left, right) => left === right,
    isNumberLike: type => type.domain === "number", isBigIntLike: type => type.domain === "bigint",
  } };
  const index = createCsharpSourceUnionIndex();
  const carrier = csharpRuntimeUnionTargetType([floating, wide]);
  index.retain(carrier, [{ source: numberType, carrier: floating }, { source: bigintType, carrier: wide }], queries, { depth: 0 });
  index.retain(carrier, [{ source: narrowType, carrier: narrow }, { source: wideType, carrier: nativeWide }], queries, { depth: 0 });
  assert.equal(index.select(carrier, narrowType, queries).carrier === floating, true,
    "an int32 array contribution retains the authored number arm instead of inventing an int32 payload");
  assert.equal(index.select(carrier, wideType, queries).carrier === wide, true,
    "an int64 contribution retains the authored bigint arm without inventing an int64 payload");
  assert.equal(index.select(carrier, {}, queries).kind, "rejected", "a missing checked source domain never chooses a payload");
  const ambiguous = csharpRuntimeUnionTargetType([floating, narrow]);
  index.retain(ambiguous, [{ source: numberType, carrier: floating }, { source: narrowType, carrier: narrow }], queries, { depth: 0 });
  assert.equal(index.select(ambiguous, { domain: "number" }, queries).kind, "rejected",
    "distinct real payloads in the same checked numeric domain remain ambiguous");
  assert.equal(index.select(ambiguous, narrowType, queries).carrier === narrow, true,
    "an exact checked identity still selects a real native payload");
});
