import assert from "node:assert/strict";
import test from "node:test";
import { getCsharpTypeofRuntimeKind } from "../../dist/target-model/types/runtime-kind.js";
import { csharpNullableTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpVoidTargetType, csharpTargetNamedType } from "../../dist/target-model/types/index.js";
import { projectDefinitionTargetType } from "../../dist/policy/types/project/declaration-carriers.js";
import { planCsharpRuntimeCategory } from "../../dist/backend/planner/expressions/runtime-category.js";
import { createDestructuringPlannerState } from "../../dist/backend/planner/bindings/binding-state.js";
import { csharpJsMapTargetType, csharpJsSetTargetType, csharpJsWeakMapTargetType, csharpJsWeakSetTargetType,
  csharpJsSymbolTargetType, csharpJsPromiseFulfilledResultTargetType, csharpJsPromiseRejectedResultTargetType,
  csharpJsArrayBufferTargetType, csharpJsDataViewTargetType, csharpJsDateTargetType,
  csharpJsRegExpTargetType, csharpJsRegExpNamedGroupsTargetType, csharpJsRegExpNamedIndicesTargetType,
  csharpJsRegExpStringIteratorTargetType, csharpExactJsRegExpNamedGroupsTargetType,
  csharpExactJsRegExpNamedIndicesTargetType, csharpExactJsRegExpStringIteratorTargetType,
} from "../../dist/target-model/types/carriers/js.js";

// Basis (nextgen C-2542, K-2658, N3'/A1/A7): the typeof category is the Host one (facts.values.typeofCategory). The planner
// emits the published category and never re-derives it from the carrier, so a uint64 carrier of Q1 number origin emits
// "number" and the same carrier of bigint origin emits "bigint"; the forged-category rejection (a carrier cross-check)
// is removed with the carrier classifier.
test("optional runtime categories emit the Host present and absent categories over the physical carrier", () => {
  for (const [value, kind, absent] of [[csharpStringTargetType(), "string", "object"],
    [csharpSourcePrimitiveTargetType("uint64"), "bigint", "undefined"], [csharpSourcePrimitiveTargetType("uint64"), "number", "object"]]) {
    const sourceCarrier = csharpNullableTargetType(value);
    const selected = Object.freeze({ kind: "optional", sourceCarrier, element: value, value: kind, absent });
    const context = { scope: {}, program: { typeDefinitions: undefined } };
    const input = { kind: "IdentifierName", name: "value" };
    const state = createDestructuringPlannerState();
    const prelude = [];
    const planned = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state, prelude, "omit");
    assert.deepEqual(planned.expression, input);
    assert.deepEqual(planned.arms[0].expression, { kind: "LiteralExpression", value: absent });
    assert.deepEqual(planned.arms[1].expression, { kind: "LiteralExpression", value: kind });
    const comparison = { runtimeKind: kind, negated: false };
    const tested = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state, prelude, "omit", comparison);
    assert.deepEqual(tested.arms[0].expression, { kind: "LiteralExpression", value: false });
    assert.deepEqual(tested.arms[1].expression, { kind: "LiteralExpression", value: true });
    const negated = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state, prelude, "omit", { ...comparison, negated: true });
    assert.deepEqual(negated.arms[0].expression, { kind: "LiteralExpression", value: true });
    assert.deepEqual(negated.arms[1].expression, { kind: "LiteralExpression", value: false });
    assert.equal(prelude.length, 0, "the same native optional dispatch needs no extra evaluation prelude");
  }
});

test("native profile producer carriers retain their exact physical object and symbol runtime kinds", () => {
  const value = csharpStringTargetType();
  for (const type of [csharpJsMapTargetType(value, value), csharpJsSetTargetType(value),
    csharpJsWeakMapTargetType(value, value), csharpJsWeakSetTargetType(value),
    csharpJsPromiseFulfilledResultTargetType(csharpVoidTargetType()), csharpJsPromiseFulfilledResultTargetType(value),
    csharpJsPromiseRejectedResultTargetType(), csharpJsArrayBufferTargetType(), csharpJsDataViewTargetType(),
    csharpJsDateTargetType(), csharpJsRegExpTargetType(), csharpJsRegExpNamedGroupsTargetType(),
    csharpJsRegExpNamedIndicesTargetType(), csharpJsRegExpStringIteratorTargetType(),
    csharpExactJsRegExpNamedGroupsTargetType(), csharpExactJsRegExpNamedIndicesTargetType(),
    csharpExactJsRegExpStringIteratorTargetType()]) {
    assert.equal(getCsharpTypeofRuntimeKind(type), "object", type.id);
  }
  assert.equal(getCsharpTypeofRuntimeKind(csharpJsSymbolTargetType()), "symbol");
  for (const kind of ["class", "interface", "struct"]) {
    assert.equal(getCsharpTypeofRuntimeKind(projectDefinitionTargetType({ id: `owned-${kind}`, sourceName: "Entry", kind }, [])), "object");
  }
  assert.equal(getCsharpTypeofRuntimeKind(csharpTargetNamedType("external-interface", undefined, { kind: "named", name: "External" }, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "interface" })), undefined);
});
