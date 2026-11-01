import type { CsharpPlanningContext } from "../context.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import { objectShapeStorageMemberName } from "../../../target-model/names/object-members.js";

const objectType: CsharpTypeNode = { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } };
const stringType: CsharpTypeNode = { kind: "PredefinedType", name: "string" };

export function csharpClosedPropertyInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Runtime", "IDynamicObject");
}

export function renderCsharpClosedPropertyDispatch(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpMethodDeclaration[] {
  const read: CsharpStatement[] = [];
  const write: CsharpStatement[] = [];
  const key: CsharpExpression = { kind: "IdentifierName", name: "key" };
  const value: CsharpExpression = { kind: "IdentifierName", name: "value" };
  const reject = (message: string): CsharpStatement => ({ kind: "ThrowStatement", expression: {
    kind: "ObjectCreationExpression", type: qualifiedCsharpType("System", "NotSupportedException"),
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: message } }],
  } });
  for (const member of shape.members) {
    if (member.sourceKey.kind !== "property") continue;
    const condition: CsharpExpression = { kind: "BinaryExpression", left: key,
      operatorToken: { kind: "EqualsEqualsToken" }, right: { kind: "LiteralExpression", value: member.sourceKey.name } };
    const selected = input.program.records.objectMember.get(shape, member)?.declaration;
    const method = member.memberKind !== "method" ? undefined
      : selected?.kind === "authored" && selected.value.kind === "delegate"
      ? { name: selected.value.name, type: selected.value.type }
      : selected?.kind === "method" ? { name: objectShapeStorageMemberName(shape, member), type: selected.storage }
      : selected?.kind === "optional-method" ? { name: objectShapeStorageMemberName(shape, member), type: selected.type }
      : undefined;
    if (member.memberKind === "method" && method === undefined) {
      read.push({ kind: "IfStatement", condition, thenBody: { kind: "Block", statements: [
        reject("This callable member has no closed native value observation contract."),
      ] } });
      continue;
    }
    const type = csharpTypeFromTargetTypeRef(method?.type ?? member.type, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted closed property requires its exact native carrier.", member.sourceDeclarations?.[0]);
    const field: CsharpExpression = { kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "this" }, name: method?.name ?? member.targetName };
    read.push({ kind: "IfStatement", condition, thenBody: { kind: "Block", statements: [
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression",
        operatorToken: { kind: "EqualsToken" }, left: value, right: field } },
      { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: true } },
    ] } });
    if (member.readonly || member.accessor !== undefined && !member.accessor.setter) continue;
    write.push({ kind: "IfStatement", condition, thenBody: { kind: "Block", statements: [
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: field, right: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
          receiver: qualifiedCsharpType("Tsonic.CSharp.Runtime", "TsValue"), name: "CastDynamic", typeArguments: [type] },
        arguments: [{ kind: "Argument", expression: value }] } } },
      { kind: "ReturnStatement" },
    ] } });
  }
  const modifiers = (name: string) => ["public" as const,
    ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, name)];
  return [
    { kind: "MethodDeclaration", name: "TryReadDynamicSlot", modifiers: modifiers("TryReadDynamicSlot"),
      returnType: { kind: "PredefinedType", name: "bool" },
      parameters: [{ name: "key", type: stringType }, { name: "value", type: objectType, passing: "out" }],
      body: { kind: "Block", statements: [...read,
        { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
          left: value, right: { kind: "LiteralExpression", value: null } } },
        { kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: false } },
      ] } },
    { kind: "MethodDeclaration", name: "WriteDynamicSlot", modifiers: modifiers("WriteDynamicSlot"),
      returnType: { kind: "PredefinedType", name: "void" },
      parameters: [{ name: "key", type: stringType }, { name: "value", type: objectType }],
      body: { kind: "Block", statements: [...write,
        reject("The closed native object has no writable property with this name."),
      ] } },
  ];
}
