import assert from "node:assert/strict";
import test from "node:test";
import { csharpTargetNamedType, csharpStringTargetType, csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape, csharpNullableTargetType } from "../../../dist/target-model/types/index.js";
import { csharpCollectionElementRead } from "../../../dist/policy/operations/collections/element-reads.js";
import { planCsharpCollectionElementRead, planCsharpCollectionIndexedIteration } from "../../../dist/backend/planner/expressions/collection-reads.js";
import { planCsharpSequenceAppendStatements } from "../../../dist/backend/planner/expressions/sequence-conversions.js";
import { csharpTypeEmissionRecord } from "../../helpers/planning-records.mjs";

// The planner reads each collection's read and length selection from the sealed type emission record.
const typeEmission = csharpTypeEmissionRecord();
const planning = { scope: {}, program: { records: { typeEmission } } };
const plannerInvariant = message => error => error instanceof Error && error.phase === "planning" && error.message === message;

const element = csharpStringTargetType();
const physical = csharpTargetNamedType("example.NativeValues", undefined, csharpQualifiedTypeRenderShape("example", "NativeValues"), { allowsRefLikeTypeArguments: [],
  valueType: true, readOnlyIndexableElementType: element, enumerableElementType: element, indexableLengthMemberName: "Count",
});
const owner = csharpTargetNamedType("example.NativeReads", undefined, csharpQualifiedTypeRenderShape("example", "NativeReads"), { allowsRefLikeTypeArguments: [],});
const member = {
  id: "example.NativeReads.read(example.NativeValues,System.Int32)", sourceName: "read", targetName: "read",
  kind: "method", static: true, readonly: true, declaringType: owner,
  parameters: [{ name: "values", type: physical, passingMode: "by-value" },
    { name: "index", type: csharpSourcePrimitiveTargetType("int32"), passingMode: "by-value" }], returnType: element,
};
const carrier = { ...physical, csharpIndexableReadMember: member };
const receiver = { kind: "IdentifierName", name: "values" };
const index = { kind: "IdentifierName", name: "index" };

test("native indexed reads share one exact typed member selection and AST lowering without wrappers", () => {
  assert.deepEqual(csharpCollectionElementRead(carrier), { kind: "method", element, member });
  assert.deepEqual(csharpCollectionElementRead(physical), { kind: "indexer", element });
  assert.deepEqual(planCsharpCollectionElementRead(physical, receiver, index, planning), {
    kind: "ElementAccessExpression", receiver, arguments: [index],
  });
  const planned = planCsharpCollectionElementRead(carrier, receiver, index, planning);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "read");
  assert.equal(planned.callee.receiver.name, "NativeReads");
  assert.deepEqual(planned.arguments, [{ kind: "Argument", expression: receiver }, { kind: "Argument", expression: index }]);
  assert.equal(member.parameters[0].type.csharpIndexableReadMember, undefined);
});

test("native read signatures fail closed for wrong physical receiver, width, result, mutation or invocation", () => {
  for (const changed of [
    { ...member, static: false }, { ...member, readonly: false }, { ...member, kind: "property" },
    { ...member, declaringType: undefined }, { ...member, targetName: "" }, { ...member, id: "" },
    { ...member, returnType: csharpNullableTargetType(element) },
    { ...member, parameters: [{ ...member.parameters[0], type: owner }, member.parameters[1]] },
    { ...member, parameters: [{ ...member.parameters[0], passingMode: "byref-readwrite" }, member.parameters[1]] },
    { ...member, parameters: [member.parameters[0], { ...member.parameters[1], type: csharpSourcePrimitiveTargetType("float64") }] },
    { ...member, parameters: [member.parameters[0], { ...member.parameters[1], type: csharpSourcePrimitiveTargetType("int64") }] },
    { ...member, parameters: [member.parameters[0], { ...member.parameters[1], optional: true }] },
    { ...member, parameters: [member.parameters[0], { ...member.parameters[1], paramsArray: true }] },
    { ...member, parameters: member.parameters.slice(0, 1) },
    { ...member, csharpInvocation: { kind: "numeric-conversion" } },
    { ...member, csharpReturnPassing: "byref-readwrite" },
    { ...member, typeParameters: [{ csharpAllowsRefLike: false, identity: "T", name: "T" }] },
  ]) {
    const selected = { ...carrier, csharpIndexableReadMember: changed };
    assert.equal(csharpCollectionElementRead(selected).kind, "invalid", JSON.stringify(changed));
    assert.equal(typeEmission.get(selected).collectionRead, undefined, "the analysis seals no read for an invalid signature");
    assert.throws(() => planCsharpCollectionElementRead(selected, receiver, index, planning),
      plannerInvariant("An admitted collection read requires its exact sealed native access."));
  }
  assert.equal(csharpCollectionElementRead({ ...carrier, csharpReadOnlyIndexableElementType: undefined }).kind, "invalid");
});

test("native readonly indexed iteration and identity spreads consume the exact read method without boxing or bypass", () => {
  const append = value => ({ kind: "ExpressionStatement", expression: value });
  const loop = planCsharpCollectionIndexedIteration(carrier, receiver, "elementIndex", value => [append(value)], planning);
  assert.equal(loop.kind, "ForStatement");
  assert.deepEqual(loop.condition.right, { kind: "SimpleMemberAccessExpression", receiver, name: "Count" });
  assert.equal(loop.body.statements[0].expression.callee.name, "read");
  assert.equal(loop.body.statements[0].expression.arguments[1].expression.name, "elementIndex");
  const source = { carrier, expression: receiver, elements: [{ carrier: element, conversion: { kind: "identity" },
    type: { kind: "PredefinedType", name: "string" } }], lengthMember: "Count",
    // The analysis seals the readonly indexed collection as an indexed sequence.
    sequence: { iteration: "indexed", tupleMembers: [], bulkCopy: false, appendSequence: false, resultCarrier: carrier } };
  const input = { ...planning, names: { temporaryName: () => "selectedIndex" } };
  const statements = planCsharpSequenceAppendStatements({}, source, receiver, {}, input, [], element, append);
  assert.equal(statements[0].kind, "ForStatement");
  assert.equal(statements[0].body.statements[0].expression.callee.name, "read");
  assert.equal(statements[0].body.statements[0].expression.arguments[1].expression.name, "selectedIndex");
  const serialized = JSON.stringify(statements);
  assert.doesNotMatch(serialized, /ForEachStatement|AppendSequence|IEnumerable|ObjectCreationExpression/u);
  assert.throws(() => planCsharpCollectionIndexedIteration({ ...carrier, csharpIndexableLengthMemberName: undefined }, receiver,
    "elementIndex", value => [append(value)], planning),
  plannerInvariant("An admitted indexed iteration requires its selected native length member."));
  assert.throws(() => planCsharpCollectionIndexedIteration({ ...carrier, csharpIndexableReadMember: { ...member, returnType: owner } },
    receiver, "elementIndex", value => [append(value)], planning),
  plannerInvariant("An admitted collection read requires its exact sealed native access."));
});
