import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpInterfaceMember, CsharpTypeMember, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { csharpEnumerableKeysMethodName, csharpEnumerableKeysStorageName } from "../../../../target-model/names/object-members.js";

const stringType: CsharpTypeNode = { kind: "PredefinedType", name: "string" };
export const csharpEnumerableKeysType: CsharpTypeNode = {
  kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" },
  name: "ReadOnlySpan", typeArguments: [stringType],
};

export function csharpEnumerableKeysContract(): CsharpInterfaceMember {
  return { kind: "MethodDeclaration", name: csharpEnumerableKeysMethodName,
    returnType: csharpEnumerableKeysType, parameters: [] };
}

export function renderCsharpEnumerableKeys(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpTypeMember[] | undefined {
  const order = input.program.objectShapes.propertyOrder(shape, undefined, "keys");
  if (order.kind === "rejected") return undefined;
  return [
    { kind: "FieldDeclaration", name: csharpEnumerableKeysStorageName, modifiers: ["private", "static", "readonly"],
      type: { kind: "ArrayType", elementType: stringType },
      initializer: { kind: "ArrayCreationExpression", elementType: stringType,
        elements: order.propertyOrder.map(value => ({ kind: "LiteralExpression", value })) } },
    { kind: "MethodDeclaration", name: csharpEnumerableKeysMethodName, modifiers: ["public"],
      returnType: csharpEnumerableKeysType, parameters: [],
      body: { kind: "Block", statements: [{ kind: "ReturnStatement",
        expression: { kind: "IdentifierName", name: csharpEnumerableKeysStorageName } }] } },
  ];
}

export function isCsharpEnumerableKeysMember(member: CsharpTypeMember): boolean {
  return member.kind === "FieldDeclaration" && member.name === csharpEnumerableKeysStorageName ||
    member.kind === "MethodDeclaration" && member.name === csharpEnumerableKeysMethodName;
}
