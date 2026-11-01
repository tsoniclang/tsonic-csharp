import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpStructuralObjectEmissionRecords } from "../../../target-model/records/objects/structural-object-emission.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function csharpNativeSlotInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Runtime", "IDynamicObject");
}

export function renderCsharpNativeSlotMembers(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  records: CsharpStructuralObjectEmissionRecords,
): readonly CsharpMethodDeclaration[] {
  const selected = records.structuralObject.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("A closed object requires its sealed native slot inventory.");
  if (selected.dynamicMembers === undefined) return [];
  const value: CsharpExpression = { kind: "IdentifierName", name: "value" };
  const object: CsharpTypeNode = { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } };
  const readable: CsharpStatement[] = selected.dynamicMembers.length === 0 ? [] : [{ kind: "SwitchStatement",
    expression: { kind: "IdentifierName", name: "key" }, sections: selected.dynamicMembers.map(member => ({
      kind: "SwitchSection", label: { kind: "CaseSwitchLabel", expression: { kind: "LiteralExpression", value: member.key } },
      statements: [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: value, right: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: member.name } } },
        { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: true } }],
    })) }];
  const writableMembers = selected.dynamicMembers.filter(member => member.writable);
  const writable: CsharpStatement[] = writableMembers.length === 0 ? [] : [{ kind: "SwitchStatement",
    expression: { kind: "IdentifierName", name: "key" }, sections: writableMembers.map(member => {
      const type = csharpTypeFromTargetTypeRef(member.type, typeParameterNames);
      if (type === undefined) failCsharpPlannerInvariant("A closed native slot requires its sealed renderable write carrier.");
      return { kind: "SwitchSection", label: { kind: "CaseSwitchLabel", expression: { kind: "LiteralExpression", value: member.key } },
        statements: [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
          left: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: member.name },
          right: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
            receiver: qualifiedCsharpType("Tsonic.CSharp.Runtime", "TsValue"), name: "CastDynamic", typeArguments: [type] },
            arguments: [{ kind: "Argument", expression: value }] } } }, { kind: "ReturnStatement" }] };
    }) }];
  return [{
    kind: "MethodDeclaration", explicitInterface: csharpNativeSlotInterfaceType(), name: "TryReadDynamicSlot", modifiers: [],
    returnType: { kind: "PredefinedType", name: "bool" },
    parameters: [{ name: "key", type: { kind: "PredefinedType", name: "string" } }, { name: "value", type: object, passing: "out" }],
    body: { kind: "Block", statements: [...readable,
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: value, right: { kind: "LiteralExpression", value: null } } },
      { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: false } },
    ] },
  }, {
    kind: "MethodDeclaration", explicitInterface: csharpNativeSlotInterfaceType(), name: "WriteDynamicSlot", modifiers: [],
    returnType: { kind: "PredefinedType", name: "void" },
    parameters: [{ name: "key", type: { kind: "PredefinedType", name: "string" } }, { name: "value", type: object }],
    body: { kind: "Block", statements: [...writable, { kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
      type: qualifiedCsharpType("System", "InvalidOperationException"), arguments: [{ kind: "Argument", expression: {
        kind: "LiteralExpression", value: "The native object has no writable field with this name." } }] } }] },
  }];
}
