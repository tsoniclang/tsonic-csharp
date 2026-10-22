import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpCollectionElementRead(
  carrier: TargetTypeRef, receiver: CsharpExpression, index: CsharpExpression,
  input: CsharpPlanningContext,
): CsharpExpression | undefined {
  const selection = input.program.records.typeEmission.get(carrier)?.collectionRead;
  if (selection === undefined) failCsharpPlannerInvariant("An admitted collection read requires its exact sealed native access.");
  if (selection.kind === "indexer") return { kind: "ElementAccessExpression", receiver, arguments: [index] };
  const owner = csharpTypeFromTargetTypeRef(selection.member.declaringType!, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted collection read requires its native member owner.");
  return { kind: "InvocationExpression",
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
  input: CsharpPlanningContext,
): CsharpStatement | undefined {
  const length = input.program.records.typeEmission.get(carrier)?.collectionLength;
  if (length === undefined) failCsharpPlannerInvariant("An admitted indexed iteration requires its selected native length member.");
  const index: CsharpExpression = { kind: "IdentifierName", name: indexName };
  const value = planCsharpCollectionElementRead(carrier, receiver, index, input);
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
