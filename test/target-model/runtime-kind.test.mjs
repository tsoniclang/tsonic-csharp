import assert from "node:assert/strict";
import test from "node:test";
import { getCsharpTypeofResult } from "../../dist/target-model/types/runtime-kind.js";
import { csharpNullableTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpVoidTargetType, csharpTargetNamedType } from "../../dist/target-model/types/index.js";
import { projectDefinitionTargetType } from "../../dist/policy/types/project/project-types.js";
import { planCsharpRuntimeCategory } from "../../dist/backend/planner/expressions/runtime-category.js";
import { createDestructuringPlannerState } from "../../dist/backend/planner/bindings/binding-state.js";
import { csharpJsMapTargetType, csharpJsSetTargetType, csharpJsWeakMapTargetType, csharpJsWeakSetTargetType,
  csharpJsSymbolTargetType, csharpJsPromiseFulfilledResultTargetType, csharpJsPromiseRejectedResultTargetType,
  csharpJsArrayBufferTargetType, csharpJsDataViewTargetType, csharpJsDateTargetType,
  csharpJsRegExpTargetType, csharpJsRegExpNamedGroupsTargetType, csharpJsRegExpNamedIndicesTargetType,
  csharpJsRegExpStringIteratorTargetType, csharpExactJsRegExpNamedGroupsTargetType,
  csharpExactJsRegExpNamedIndicesTargetType, csharpExactJsRegExpStringIteratorTargetType,
} from "../../dist/policy/types/resolution/surface-types.js";

test("optional runtime categories preserve their exact present kind and reject forged nested facts", () => {
  for (const [value, kind] of [[csharpStringTargetType(), "string"], [csharpSourcePrimitiveTargetType("uint64"), "bigint"]]) {
    const sourceCarrier = csharpNullableTargetType(value);
    const selected = getCsharpTypeofResult(sourceCarrier);
    assert.deepEqual(selected, { kind: "optional", sourceCarrier, element: value, value: kind });
    const context = { scope: {}, program: { typeDefinitions: undefined } };
    const input = { kind: "IdentifierName", name: "value" };
    const state = createDestructuringPlannerState();
    const planned = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state);
    assert.deepEqual(planned.expression, input);
    assert.deepEqual(planned.arms[0].expression, { kind: "LiteralExpression", value: "object" });
    assert.deepEqual(planned.arms[1].expression, { kind: "LiteralExpression", value: kind });
    assert.equal(planCsharpRuntimeCategory(input, sourceCarrier, { ...selected, value: "boolean" }, context, state), undefined);
    assert.equal(planCsharpRuntimeCategory(input, sourceCarrier, { ...selected, sourceCarrier: value }, context, state), undefined);
    const comparison = { runtimeKind: kind, negated: false };
    const tested = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state, comparison);
    assert.deepEqual(tested.arms[0].expression, { kind: "LiteralExpression", value: false });
    assert.deepEqual(tested.arms[1].expression, { kind: "LiteralExpression", value: true });
    const negated = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state, { ...comparison, negated: true });
    assert.deepEqual(negated.arms[0].expression, { kind: "LiteralExpression", value: true });
    assert.deepEqual(negated.arms[1].expression, { kind: "LiteralExpression", value: false });
  }
});

test("native profile producer facts retain exact object and symbol categories", () => {
  const value = csharpStringTargetType();
  for (const type of [csharpJsMapTargetType(value, value), csharpJsSetTargetType(value),
    csharpJsWeakMapTargetType(value, value), csharpJsWeakSetTargetType(value),
    csharpJsPromiseFulfilledResultTargetType(csharpVoidTargetType()), csharpJsPromiseFulfilledResultTargetType(value),
    csharpJsPromiseRejectedResultTargetType(), csharpJsArrayBufferTargetType(), csharpJsDataViewTargetType(),
    csharpJsDateTargetType(), csharpJsRegExpTargetType(), csharpJsRegExpNamedGroupsTargetType(),
    csharpJsRegExpNamedIndicesTargetType(), csharpJsRegExpStringIteratorTargetType(),
    csharpExactJsRegExpNamedGroupsTargetType(), csharpExactJsRegExpNamedIndicesTargetType(),
    csharpExactJsRegExpStringIteratorTargetType()]) {
    assert.equal(getCsharpTypeofResult(type), "object", type.id);
  }
  assert.equal(getCsharpTypeofResult(csharpJsSymbolTargetType()), "symbol");
  for (const kind of ["class", "interface", "struct"]) {
    assert.equal(getCsharpTypeofResult(projectDefinitionTargetType({ id: `owned-${kind}`, sourceName: "Entry", kind }, [])), "object");
  }
  assert.equal(getCsharpTypeofResult(csharpTargetNamedType("external-interface", undefined,
    { kind: "named", name: "External" }, { sourceDeclarationKind: "interface" })), undefined);
});
