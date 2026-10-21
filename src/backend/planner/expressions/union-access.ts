import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

function unionAccess(carrier: TargetTypeRef | undefined, input: CsharpPlanningContext) {
  if (carrier === undefined) failCsharpPlannerInvariant("An admitted union access requires its native carrier.");
  return input.program.records.typeEmission.get(carrier)?.unionAccess
    ?? failCsharpPlannerInvariant("An admitted union access requires its sealed storage form.");
}

export function runtimeUnionArmProjection(baseExpression: CsharpExpression, armIndex: number,
  carrier: TargetTypeRef | undefined, retainsAbsence: boolean, input: CsharpPlanningContext): CsharpExpression {
  if (retainsAbsence) return { kind: "InvocationExpression",
    callee: { kind: "ConditionalAccessExpression", receiver: baseExpression, name: `As${armIndex + 1}` }, arguments: [] };
  const selected = unionAccess(carrier, input);
  const receiver: CsharpExpression = selected.kind === "nullable"
    ? { kind: "SimpleMemberAccessExpression", receiver: { kind: "PostfixUnaryExpression", operand: baseExpression,
        operatorToken: { kind: "ExclamationToken" } }, name: "Value" }
    : selected.kind === "generic" ? csharpTypeFromTargetTypeRef(selected.operations, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted generic union access requires its native operation owner.") : baseExpression;
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name: `As${armIndex + 1}` },
    arguments: selected.kind === "generic" ? [{ kind: "Argument", expression: baseExpression }] : [] };
}

export function runtimeUnionArmTest(baseExpression: CsharpExpression, armIndex: number,
  carrier: TargetTypeRef | undefined, input: CsharpPlanningContext): CsharpExpression {
  const selected = unionAccess(carrier, input);
  const receiver = selected.kind === "generic" ? csharpTypeFromTargetTypeRef(selected.operations, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted generic union test requires its native operation owner.") : baseExpression;
  const test: CsharpExpression = { kind: "InvocationExpression", callee: {
    kind: selected.kind === "nullable" ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression", receiver, name: `Is${armIndex + 1}` },
    arguments: selected.kind === "generic" ? [{ kind: "Argument", expression: baseExpression }] : [] };
  return selected.kind === "nullable" ? { kind: "BinaryExpression", left: test, operatorToken: { kind: "EqualsEqualsToken" },
    right: { kind: "LiteralExpression", value: true } } : test;
}
