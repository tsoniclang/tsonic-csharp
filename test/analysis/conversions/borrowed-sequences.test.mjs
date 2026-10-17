import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

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
    literalValues: { literalValue: Object.freeze({ get: () => undefined }) },
    target: {},
  };
  const evidence = { compileTimeMetadata: { get: () => false },
    valueRefinement: { get: () => undefined },
    nodeTargetType: { get: () => undefined } };
  const shapes = { resolveNode: () => undefined, resolveTarget: () => undefined };
  const analysis = analyzeCsharpConversions(policy, evidence, shapes);
  analysis.prepare({
    operations: { nativeUnreachable: Object.freeze({ get: () => false }), operationResultType: Object.freeze({ get: () => undefined }), selectedCall: Object.freeze({ get: () => undefined }),
      selectedConstruction: Object.freeze({ get: () => undefined }),
      borrowedSequence: Object.freeze({ get: node => node === expression ? sequence : undefined }) },
    expectedTypes: { expectedType: Object.freeze({ get: () => [] }), requiredExpectedType: Object.freeze({ get: () => [] }), callableTarget: Object.freeze({ get: () => undefined }) },
    valueReads: { valueRead: Object.freeze({ get: () => undefined }) },
  });
  analysis.close({ entries: Object.freeze([]) }, []);
  return analysis.seal();
}

const nativeInput = elements => ({ kind: "sequence", expression: {},
  carrier: { kind: "tuple", elements }, presentCarrier: { kind: "tuple", elements },
  optional: false, lengthMember: undefined, elements });

test("borrowed sequence sealing closes every exact native leaf-to-destination pair", () => {
  const conversions = sealedConversions([nativeInput([int32, int64])]);
  assert.deepEqual(conversions.conversion.get(int32, int64, "implicit"), { kind: "implicit", proof: "numeric" });
  assert.deepEqual(conversions.conversion.get(int64, int64, "implicit"), { kind: "identity" });
  assert.equal(conversions.conversion.get(int32, int64, "explicit"), undefined);
  assert.equal(conversions.conversion.get(boolean, int64, "implicit"), undefined);
  assert.deepEqual(conversions.issues, []);
  assert.equal(Object.isFrozen(conversions), true);
});

test("borrowed sequence sealing retains rejected conversions instead of manufacturing identity", () => {
  const conversions = sealedConversions([nativeInput([boolean])]);
  assert.equal(conversions.conversion.get(boolean, int64, "implicit").kind, "rejected");
  assert.equal(conversions.conversion.get(int64, int64, "implicit"), undefined);
});

test("empty borrowed alternatives cannot publish fabricated native element pairs", () => {
  const conversions = sealedConversions([{ kind: "empty", expression: {}, elements: [int32] }]);
  assert.equal(conversions.conversion.get(int32, int64, "implicit"), undefined);
  assert.deepEqual(conversions.issues, []);
});

test("repeated alternatives reuse the single sealed pair classification", () => {
  const conversions = sealedConversions([nativeInput([int32]), nativeInput([int32])]);
  const selected = conversions.conversion.get(int32, int64, "implicit");
  assert.deepEqual(selected, { kind: "implicit", proof: "numeric" });
  assert.strictEqual(conversions.conversion.get(int32, int64, "implicit"), selected);
  assert.equal(conversions.conversion.get(int32, boolean, "implicit"), undefined);
});
