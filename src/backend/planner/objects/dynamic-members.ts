import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpStructuralObjectEmissionRecords } from "../../../target-model/records/objects/structural-object-emission.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function csharpDynamicObjectInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Runtime", "IDynamicObject");
}

export function renderCsharpDynamicObjectMembers(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  records: CsharpStructuralObjectEmissionRecords,
): readonly CsharpMethodDeclaration[] {
  const selected = records.structuralObject.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("A closed object requires its sealed dynamic member inventory.");
  if (selected.dynamicMembers === undefined) return [];
  const value: CsharpExpression = { kind: "IdentifierName", name: "value" };
  const object: CsharpTypeNode = { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } };
  return [{
    kind: "MethodDeclaration", explicitInterface: csharpDynamicObjectInterfaceType(), name: "TryReadDynamicSlot", modifiers: [],
    returnType: { kind: "PredefinedType", name: "bool" },
    parameters: [{ name: "key", type: { kind: "PredefinedType", name: "string" } }, { name: "value", type: object, passing: "out" }],
    body: { kind: "Block", statements: [{ kind: "SwitchStatement", expression: { kind: "IdentifierName", name: "key" },
      sections: selected.dynamicMembers.map(member => ({ kind: "SwitchSection", label: {
        kind: "CaseSwitchLabel", expression: { kind: "LiteralExpression", value: member.key } }, statements: [
        { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
          left: value, right: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: member.name } } },
        { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: true } },
      ] })) },
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: value, right: { kind: "LiteralExpression", value: null } } },
      { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: false } },
    ] },
  }, {
    kind: "MethodDeclaration", explicitInterface: csharpDynamicObjectInterfaceType(), name: "WriteDynamicSlot", modifiers: [],
    returnType: { kind: "PredefinedType", name: "void" },
    parameters: [{ name: "key", type: { kind: "PredefinedType", name: "string" } }, { name: "value", type: object }],
    body: { kind: "Block", statements: [{ kind: "SwitchStatement", expression: { kind: "IdentifierName", name: "key" },
      sections: selected.dynamicMembers.filter(member => member.writable).map(member => {
        const type = csharpTypeFromTargetTypeRef(member.type, typeParameterNames);
        if (type === undefined) failCsharpPlannerInvariant("A closed native slot requires its sealed renderable write carrier.");
        return { kind: "SwitchSection", label: { kind: "CaseSwitchLabel", expression: { kind: "LiteralExpression", value: member.key } },
          statements: [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
            left: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: member.name },
            right: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
              receiver: qualifiedCsharpType("Tsonic.CSharp.Runtime", "TsValue"), name: "CastDynamic", typeArguments: [type] },
              arguments: [{ kind: "Argument", expression: value }] } } }, { kind: "ReturnStatement" }] };
      }) }, { kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
      type: qualifiedCsharpType("System", "InvalidOperationException"), arguments: [{ kind: "Argument", expression: {
        kind: "LiteralExpression", value: "The native object has no writable field with this name." } }] } }] },
  }];
}
