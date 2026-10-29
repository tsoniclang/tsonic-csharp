import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceUnionIndex } from "../../../../dist/analysis/source-evidence/types/resolution/source-unions.js";
import { csharpAbsenceTargetType, csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/index.js";
import { createCsharpSourceUnionDefinitions } from "../../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";

const physicalArm = createCsharpSourceUnionDefinitions({
  projectTypes: () => ({ directSupertypes: () => [] }),
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
  structuralTypes: { resolveTarget: () => undefined },
}, () => assert.fail("the correspondence fixture must not reconstruct source types")).physicalArm;

test("absorbed native source arms retain their checked correspondence without gaining narrower writable capability", () => {
  const errorSource = {};
  const nativeSource = {};
  const foreign = {};
  const error = csharpRuntimeErrorTargetType();
  const exception = csharpExceptionTargetType();
  const queries = { declarations: { typeSymbol: () => undefined }, types: {
    isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
    aliasApplication: () => undefined, couldContainTypeVariables: () => false,
    stringLiteralValue: () => undefined, booleanLiteralValue: () => undefined,
    isNumberLike: () => false, isBigIntLike: () => false, isIdentical: (left, right) => left === right,
  } };
  const members = [{ source: errorSource, carrier: error }, { source: nativeSource, carrier: exception }];
  for (const ordered of [members, [...members].reverse()]) {
    const index = createCsharpSourceUnionIndex();
    assert.equal(index.retain(exception, ordered, queries, { depth: 0 }, physicalArm) === exception, true,
      "the original physical native reference is retained");
    for (const source of [errorSource, nativeSource]) {
      const selected = index.select(exception, source, queries);
      assert.equal(selected.kind === "resolved" && selected.carrier === exception, true,
        "each original source arm maps to the same physical base, not an invented writable subtype");
    }
    assert.equal(index.select(exception, foreign, queries).kind, "rejected", "foreign checked source evidence cannot acquire a native arm");
  }
  const index = createCsharpSourceUnionIndex();
  const absence = csharpAbsenceTargetType();
  index.retain(absence, [], queries, { depth: 0 }, physicalArm);
  assert.equal(index.select(absence, foreign, queries).kind, "unavailable", "an empty absence-only contribution does not publish a false completed correspondence");
});

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
    queries, { depth: 0, sourceBindings }, physicalArm), carrier);
  sourceBindings.clear();
  assert.deepEqual(index.select(carrier, wide, queries), { kind: "resolved", carrier: integer });
  assert.deepEqual(index.select(carrier, text, queries), { kind: "resolved", carrier: string });
  assert.equal(index.select(carrier, foreign, queries).kind, "rejected");
  const signed = csharpSourcePrimitiveTargetType("int64");
  const ambiguous = csharpRuntimeUnionTargetType([integer, signed]);
  index.retain(ambiguous, [{ source: wide, carrier: integer }, { source: wide, carrier: signed }], queries, { depth: 0 }, physicalArm);
  assert.equal(index.select(ambiguous, wide, queries).kind, "rejected");
  const outer = csharpRuntimeUnionTargetType([carrier, signed]);
  index.retain(outer, [{ source: {}, carrier }, { source: foreign, carrier: signed }], queries, { depth: 0 }, physicalArm);
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
  index.retain(carrier, [{ source: number, carrier: floating }, { source: bigint, carrier: wide }], queries, { depth: 0 }, physicalArm);
  assert.equal(index.select(carrier, { domain: "number" }, queries).carrier === floating, true,
    "a distinct checked native numeric type retains its number source branch");
  assert.equal(index.select(carrier, { domain: "bigint" }, queries).carrier === wide, true,
    "a checked native wide integer retains its bigint source branch without a floating round trip");
  assert.equal(index.select(carrier, {}, queries).kind, "rejected", "unknown source correspondence stays rejected");
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const ambiguous = csharpRuntimeUnionTargetType([floating, narrow]);
  const exactNumber = { domain: "number" };
  index.retain(ambiguous, [{ source: exactNumber, carrier: floating }, { source: { domain: "number" }, carrier: narrow }],
    queries, { depth: 0 }, physicalArm);
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
  index.retain(carrier, [{ source: numberType, carrier: floating }, { source: bigintType, carrier: wide }], queries, { depth: 0 }, physicalArm);
  index.retain(carrier, [{ source: narrowType, carrier: narrow }, { source: wideType, carrier: nativeWide }], queries, { depth: 0 }, physicalArm);
  assert.equal(index.select(carrier, narrowType, queries).carrier === floating, true,
    "an int32 array contribution retains the authored number arm instead of inventing an int32 payload");
  assert.equal(index.select(carrier, wideType, queries).carrier === wide, true,
    "an int64 contribution retains the authored bigint arm without inventing an int64 payload");
  assert.equal(index.select(carrier, {}, queries).kind, "rejected", "a missing checked source domain never chooses a payload");
  const ambiguous = csharpRuntimeUnionTargetType([floating, narrow]);
  index.retain(ambiguous, [{ source: numberType, carrier: floating }, { source: narrowType, carrier: narrow }], queries, { depth: 0 }, physicalArm);
  assert.equal(index.select(ambiguous, { domain: "number" }, queries).kind, "rejected",
    "distinct real payloads in the same checked numeric domain remain ambiguous");
  assert.equal(index.select(ambiguous, narrowType, queries).carrier === narrow, true,
    "an exact checked identity still selects a real native payload");
});
