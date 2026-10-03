import assert from "node:assert/strict";
import test from "node:test";
import { csharpTargetNamedType, csharpStringTargetType, csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape, csharpNullableTargetType } from "../../../dist/target-model/types/index.js";
import { selectCsharpCollectionElementRead } from "../../../dist/target-model/types/collection-reads.js";
import { planCsharpCollectionElementRead } from "../../../dist/backend/planner/expressions/collection-reads.js";

const element = csharpStringTargetType();
const physical = csharpTargetNamedType("example.NativeValues", undefined, csharpQualifiedTypeRenderShape("example", "NativeValues"), {
  valueType: true, readOnlyIndexableElementType: element, enumerableElementType: element, indexableLengthMemberName: "Count",
});
const owner = csharpTargetNamedType("example.NativeReads", undefined, csharpQualifiedTypeRenderShape("example", "NativeReads"));
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
  assert.deepEqual(selectCsharpCollectionElementRead(carrier), { kind: "method", element, member });
  assert.deepEqual(selectCsharpCollectionElementRead(physical), { kind: "indexer", element });
  assert.deepEqual(planCsharpCollectionElementRead(physical, receiver, index), {
    kind: "ElementAccessExpression", receiver, arguments: [index],
  });
  const planned = planCsharpCollectionElementRead(carrier, receiver, index);
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
    { ...member, typeParameters: [{ identity: "T", name: "T" }] },
  ]) {
    const selected = { ...carrier, csharpIndexableReadMember: changed };
    assert.equal(selectCsharpCollectionElementRead(selected).kind, "invalid", JSON.stringify(changed));
    assert.equal(planCsharpCollectionElementRead(selected, receiver, index), undefined);
  }
  assert.equal(selectCsharpCollectionElementRead({ ...carrier, csharpReadOnlyIndexableElementType: undefined }).kind, "invalid");
});
