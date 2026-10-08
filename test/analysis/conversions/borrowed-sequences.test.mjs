import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/scalar-types.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const int64 = csharpSourcePrimitiveTargetType("int64");
const boolean = csharpSourcePrimitiveTargetType("bool");

function sealedConversions(inputs, elementTarget = int64) {
  const sourceFile = {};
  const expression = {};
  const sequence = { expression, array: {}, sourceCarrier: { kind: "array", element: elementTarget }, inputs, controlNodes: [] };
  const predicates = ["NonNullExpression", "AsExpression", "TypeAssertion", "VariableDeclaration",
    "ReturnStatement", "ArrayLiteralExpression", "StringLiteral", "NoSubstitutionTemplateLiteral",
    "NumericLiteral", "BigIntLiteral", "PrefixUnaryExpression", "CallExpression"];
  const policy = {
    sourceFiles: [sourceFile],
    ast: {
      is: Object.fromEntries(predicates.map(name => [`Is${name}`, () => false])),
      kindName: () => "KindUnknown",
      forEachChild: (node, visit) => { if (node === sourceFile) visit(expression); },
    },
    types: { resolveNode: () => undefined },
    navigation: { referenceFor: () => undefined },
    projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => undefined },
    target: {},
  };
  const evidence = { isCompileTimeMetadata: () => false, valueRefinement: () => undefined,
    nodeTargetType: () => undefined };
  const shapes = { resolveNode: () => undefined };
  const analysis = analyzeCsharpConversions(policy, evidence, shapes);
  return analysis.seal({
    operations: { nativeUnreachable: () => false, resultType: () => undefined, call: () => undefined,
      construction: () => undefined,
      borrowedSequence: node => node === expression ? sequence : undefined },
    expectedTypes: { forExpression: () => [], requiredTypesForExpression: () => [], callableTarget: () => undefined },
    storage: { type: () => undefined },
  });
}

const nativeInput = elements => ({ kind: "sequence", expression: {},
  carrier: { kind: "tuple", elements }, presentCarrier: { kind: "tuple", elements },
  optional: false, lengthMember: undefined, elements });

test("borrowed sequence sealing closes every exact native leaf-to-destination pair", () => {
  const conversions = sealedConversions([nativeInput([int32, int64])]);
  assert.deepEqual(conversions.select(int32, int64, "implicit"), { kind: "implicit", proof: "numeric" });
  assert.deepEqual(conversions.select(int64, int64, "implicit"), { kind: "identity" });
  assert.equal(conversions.select(int32, int64, "explicit"), undefined);
  assert.equal(conversions.select(boolean, int64, "implicit"), undefined);
  assert.deepEqual(conversions.issues, []);
  assert.equal(Object.isFrozen(conversions), true);
});

test("borrowed sequence sealing retains rejected conversions instead of manufacturing identity", () => {
  const conversions = sealedConversions([nativeInput([boolean])]);
  assert.equal(conversions.select(boolean, int64, "implicit").kind, "rejected");
  assert.equal(conversions.select(int64, int64, "implicit"), undefined);
});

test("empty borrowed alternatives cannot publish fabricated native element pairs", () => {
  const conversions = sealedConversions([{ kind: "empty", expression: {}, elements: [int32] }]);
  assert.equal(conversions.select(int32, int64, "implicit"), undefined);
  assert.deepEqual(conversions.issues, []);
});

test("repeated alternatives reuse the single sealed pair classification", () => {
  const conversions = sealedConversions([nativeInput([int32]), nativeInput([int32])]);
  const selected = conversions.select(int32, int64, "implicit");
  assert.deepEqual(selected, { kind: "implicit", proof: "numeric" });
  assert.strictEqual(conversions.select(int32, int64, "implicit"), selected);
  assert.equal(conversions.select(int32, boolean, "implicit"), undefined);
});
