import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceUnionIndex } from "../../../dist/policy/types/resolution/source-unions.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

test("source union evidence preserves generic bindings and rejects ambiguous native members", () => {
  const parameter = { declaration: {} };
  const wide = {};
  const text = {};
  const foreign = {};
  const queries = {
    declarations: { typeSymbol: type => type.declaration === undefined ? undefined : type,
      primarySymbolDeclaration: symbol => symbol.declaration },
    types: { isUnion: () => false, isNullish: () => false, isTypeReference: () => false,
      aliasApplication: () => undefined, couldContainTypeVariables: type => type.declaration !== undefined,
      stringLiteralValue: () => undefined,
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
