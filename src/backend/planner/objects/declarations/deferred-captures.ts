import type { CsharpTypeMember, CsharpTypeNode, CsharpExpression } from "../../../target-ast/roslyn/index.js";

export function renderCsharpDeferredCaptureMember(name: string, type: CsharpTypeNode): readonly CsharpTypeMember[] {
  const valueName = `${name}Value`;
  const initializedName = `${name}Initialized`;
  const field = (name: string): CsharpExpression => ({ kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name });
  const assign = (name: string, expression: CsharpExpression) => ({ kind: "ExpressionStatement" as const,
    expression: { kind: "AssignmentExpression" as const, left: field(name), operatorToken: { kind: "EqualsToken" as const }, right: expression } });
  return [
    { kind: "FieldDeclaration", name: valueName, type, modifiers: ["private"],
      initializer: { kind: "DefaultExpression", type, nullForgiving: true } },
    { kind: "FieldDeclaration", name: initializedName, type: { kind: "PredefinedType", name: "bool" }, modifiers: ["private"] },
    { kind: "PropertyDeclaration", name, type, modifiers: ["public"], getter: { kind: "Block", statements: [
      { kind: "IfStatement", condition: field(initializedName), thenBody: { kind: "Block", statements: [
        { kind: "ReturnStatement", expression: field(valueName) },
      ] } },
      { kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
        type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
        arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "captured binding is not initialized" } }] } },
    ] }, setter: { kind: "Block", statements: [assign(valueName, { kind: "IdentifierName", name: "value" }),
      assign(initializedName, { kind: "LiteralExpression", value: true })] } },
  ];
}
