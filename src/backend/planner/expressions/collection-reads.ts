import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpCollectionElementRead } from "../../../target-model/types/collection-reads.js";
import { getCsharpIndexableLengthMemberName } from "../../../target-model/types/collections.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function planCsharpCollectionElementRead(
  carrier: TargetTypeRef, receiver: CsharpExpression, index: CsharpExpression,
  typeParameterNames?: ReadonlyMap<string, string>,
): CsharpExpression | undefined {
  const selection = csharpCollectionElementRead(carrier);
  if (selection === undefined || selection.kind === "invalid") return undefined;
  if (selection.kind === "indexer") return { kind: "ElementAccessExpression", receiver, arguments: [index] };
  const owner = csharpTypeFromTargetTypeRef(selection.member.declaringType!, typeParameterNames);
  return owner === undefined ? undefined : { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selection.member.targetName },
    arguments: [{ kind: "Argument", expression: receiver,
      ...(selection.member.parameters[0]!.passingMode === "byref-readonly" ? { passing: "in" as const } : {}) },
      { kind: "Argument", expression: index }] };
}

export function planCsharpCollectionIndexedIteration(
  carrier: TargetTypeRef,
  receiver: CsharpExpression,
  indexName: string,
  consume: (value: CsharpExpression) => readonly CsharpStatement[] | undefined,
  typeParameterNames?: ReadonlyMap<string, string>,
): CsharpStatement | undefined {
  const length = getCsharpIndexableLengthMemberName(carrier);
  if (length === undefined) return undefined;
  const index: CsharpExpression = { kind: "IdentifierName", name: indexName };
  const value = planCsharpCollectionElementRead(carrier, receiver, index, typeParameterNames);
  const statements = value === undefined ? undefined : consume(value);
  if (statements === undefined) return undefined;
  return { kind: "ForStatement",
    initializer: { kind: "VariableDeclaration", locals: [{ kind: "VariableDeclarator", name: indexName,
      type: { kind: "PredefinedType", name: "int" }, initializer: { kind: "LiteralExpression", value: 0 } }] },
    condition: { kind: "BinaryExpression", operatorToken: { kind: "LessThanToken" }, left: index,
      right: { kind: "SimpleMemberAccessExpression", receiver, name: length } },
    incrementors: [{ kind: "PostfixUnaryExpression", operand: index, operatorToken: { kind: "PlusPlusToken" } }],
    body: { kind: "Block", statements } };
}
