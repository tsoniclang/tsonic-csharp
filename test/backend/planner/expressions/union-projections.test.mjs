import assert from "node:assert/strict";
import test from "node:test";
import { nativeUnionProjectionMutations } from "../../../../../tsonic/test/fixtures/native-union-projection-mutations.mjs";
import { admitCsharpUnionProjections } from "../../../../dist/analysis/operations/union-projections.js";
import { planCsharpNativeUnionPropertyProjection } from "../../../../dist/backend/planner/expressions/union-projections.js";
import { csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { emptyCsharpTypeDefinitions } from "../../../../dist/target-model/types/source-union-definitions.js";

test("native union admission proves every carrier and selection before rendering a single receiver", () => {
  const carriers = [csharpSourcePrimitiveTargetType("int64"), csharpStringTargetType(), csharpSourcePrimitiveTargetType("bool")];
  const resultCarrier = csharpSourcePrimitiveTargetType("int32");
  const node = Object.freeze({});
  const fact = { kind: "union-property", unionCarrier: csharpRuntimeUnionTargetType(carriers), resultCarrier,
    selectedVariantIndexes: [0, 1], variants: carriers.map((carrier, index) => ({ carrier, ...(index < 2 ? {
      operation: { receiver: { kind: "instance" }, invocation: { kind: "member" },
        targetMember: { kind: "property", name: "value", declaringType: carrier, returnType: resultCarrier } },
    } : {}) })) };
  const admit = selected => admitCsharpUnionProjections([node], {
    selectedProperty: { get: subject => subject === node ? { selection: selected } : undefined },
  }, emptyCsharpTypeDefinitions);
  assert.equal(admit(fact).length, 0, "the exact native union is admitted");
  const receiver = { kind: "IdentifierName", name: "value" };
  const input = { program: { source: { ast: { pos: () => 1, end: () => 2 } },
    records: { typeEmission: { get: carrier => carrier === fact.unionCarrier ? { unionAccess: { kind: "direct" } } : undefined } } },
    names: { temporaryName: name => name } };
  const rendered = planCsharpNativeUnionPropertyProjection(node, receiver, {
    unionCarrier: fact.unionCarrier, resultCarrier,
    variants: fact.selectedVariantIndexes.map(index => ({ index, carrier: carriers[index], memberName: "value" })),
  }, input);
  assert.equal(rendered.kind, "SwitchExpression");
  assert.equal(rendered.expression === receiver, true, "the receiver is evaluated once");
  assert.equal(rendered.arms.length, 3);
  assert.equal(rendered.arms[2].expression.kind, "ThrowExpression");
  assert.doesNotMatch(JSON.stringify(rendered), /LambdaExpression|Delegate|Match/u);
  for (const [index, mutation] of nativeUnionProjectionMutations(fact, csharpSourcePrimitiveTargetType("uint64")).entries()) {
    const rejected = admit({ ...fact, ...mutation });
    assert.equal(rejected.length, 1, "mutation " + index + ": one admission rejection");
    assert.equal(rejected[0].sourceNode === node, true, "mutation " + index + ": exact source");
    assert.equal(rejected[0].code, "CSHARP_UNION_PROJECTION_CONTRACT_INVALID", "mutation " + index);
  }
});
