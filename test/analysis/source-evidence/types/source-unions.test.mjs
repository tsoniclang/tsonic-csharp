import assert from "node:assert/strict";
import test from "node:test";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
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

test("native primitive facts retain checked union domains even when their semantic types are not builtin numeric flags", () => {
  const floatingType = {};
  const narrowType = {};
  const wideType = {};
  const bigintType = { domain: "bigint" };
  const numericLiteral = { domain: "number" };
  const floating = csharpSourcePrimitiveTargetType("float64");
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const wide = { kind: "target-named", id: "System.Numerics.BigInteger", csharpAllowsRefLikeTypeArguments: [] };
  const facts = new Map([
    [floatingType, { kind: "float64", runtimeBase: "number", signed: true, width: 64 }],
    [narrowType, { kind: "int32", runtimeBase: "number", signed: true, width: 32 }],
    [wideType, { kind: "int64", runtimeBase: "bigint", signed: true, width: 64 }],
  ]);
  const queries = { declarations: { typeSymbol: () => undefined }, facts: { typeSubjects: type => [type] }, types: {
    isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
    aliasApplication: () => undefined, couldContainTypeVariables: () => false,
    stringLiteralValue: () => undefined, booleanLiteralValue: () => undefined,
    isIdentical: (left, right) => left === right,
    isNumberLike: type => type.domain === "number", isBigIntLike: type => type.domain === "bigint",
  } };
  const index = createCsharpSourceUnionIndex(undefined, { getFact: (subject, key) => key === sourcePrimitiveFactKey ? facts.get(subject) : undefined });
  const carrier = csharpRuntimeUnionTargetType([floating, wide]);
  index.retain(carrier, [{ source: floatingType, carrier: floating }, { source: bigintType, carrier: wide }], queries, { depth: 0 });
  assert.equal(index.select(carrier, narrowType, queries).carrier === floating, true,
    "the explicit int32 fact owns the checked number branch without selecting by native convertibility");
  assert.equal(index.select(carrier, numericLiteral, queries).carrier === floating, true,
    "an ordinary checked numeric literal matches the fact-backed native number arm");
  assert.equal(index.select(carrier, wideType, queries).carrier === wide, true,
    "the exact native int64 fact stays in its bigint domain without a floating round trip");
  assert.equal(index.select(carrier, {}, queries).kind, "rejected", "a missing checked source domain never chooses a payload");
  const ambiguous = csharpRuntimeUnionTargetType([floating, narrow]);
  index.retain(ambiguous, [{ source: floatingType, carrier: floating }, { source: narrowType, carrier: narrow }], queries, { depth: 0 });
  assert.equal(index.select(ambiguous, numericLiteral, queries).kind, "rejected",
    "facts cannot choose between distinct native payloads in the same checked numeric domain");
  assert.equal(index.select(ambiguous, narrowType, queries).carrier === narrow, true,
    "exact native source identity still outranks a shared numeric domain");
});
