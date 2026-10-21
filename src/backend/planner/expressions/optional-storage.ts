import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

function optionalStorage(storage: TargetTypeRef, input: CsharpPlanningContext) {
  return input.program.records.typeEmission.get(storage)?.optionalStorage
    ?? failCsharpPlannerInvariant("An admitted optional operation requires its sealed native storage.");
}

export function planCsharpOptionalStorageOperation(storage: TargetTypeRef,
  method: "From1" | "From2" | "Is1" | "Is2" | "As1" | "As2", value: CsharpExpression,
  input: CsharpPlanningContext): CsharpExpression {
  const selected = optionalStorage(storage, input);
  if (selected.kind !== "generic") failCsharpPlannerInvariant("An admitted generic optional operation requires its native operations type.");
  const owner = csharpTypeFromTargetTypeRef(selected.operations, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted generic optional operation requires its rendered native owner.");
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: method },
    arguments: [{ kind: "Argument", expression: value }] };
}

export function planCsharpAbsentValue(storage: TargetTypeRef, input: CsharpPlanningContext): CsharpExpression | undefined {
  const selected = optionalStorage(storage, input);
  if (selected.kind === "generic") return planCsharpOptionalStorageOperation(storage, "From1", { kind: "LiteralExpression", value: null }, input);
  if (!selected.absence) return undefined;
  const type = csharpTypeFromTargetTypeRef(storage, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted absence requires its native storage type.");
  return { kind: "DefaultExpression", type };
}

export function planCsharpStorageIsAbsent(storage: TargetTypeRef, value: CsharpExpression,
  input: CsharpPlanningContext): CsharpExpression | undefined {
  const selected = optionalStorage(storage, input);
  if (selected.kind === "generic") return planCsharpOptionalStorageOperation(storage, "Is1", value, input);
  if (selected.jsValue) return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: value, name: "isUndefined" }, arguments: [] };
  return selected.absence ? { kind: "NullPatternExpression", expression: value, negated: false } : undefined;
}

export function planCsharpPresentValueGuard(storage: TargetTypeRef, _present: TargetTypeRef,
  value: CsharpExpression, name: string, input: CsharpPlanningContext):
  { readonly condition: CsharpExpression; readonly value: CsharpExpression } {
  const selected = optionalStorage(storage, input);
  const bound: CsharpExpression = { kind: "IdentifierName", name };
  if (selected.kind === "generic" || selected.jsValue) {
    const absent = planCsharpStorageIsAbsent(storage, bound, input)
      ?? failCsharpPlannerInvariant("An admitted optional guard requires its native absence test.");
    return { condition: { kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
      left: { kind: "IsPatternExpression", expression: value, type: { kind: "IdentifierName", name: "var" }, designation: name },
      right: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: absent } },
      value: selected.kind === "native" ? bound : planCsharpOptionalStorageOperation(storage, "As2", bound, input) };
  }
  const type = csharpTypeFromTargetTypeRef(selected.present, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted optional guard requires its native payload type.");
  return { condition: { kind: "IsPatternExpression", expression: value, type, designation: name }, value: bound };
}
