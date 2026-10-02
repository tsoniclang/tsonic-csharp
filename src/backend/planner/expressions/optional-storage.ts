import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { csharpCarrierAdmitsSourceAbsence, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../target-model/types/index.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function planCsharpOptionalStorageOperation(
  storage: TargetTypeRef, method: "From1" | "From2" | "Is1" | "Is2" | "As1" | "As2", value: CsharpExpression,
  typeParameterNames?: ReadonlyMap<string, string>,
): CsharpExpression {
  const optional = getCsharpGenericOptionalParts(storage);
  const owner = optional === undefined ? undefined : csharpTypeFromTargetTypeRef(optional.operations, typeParameterNames);
  if (owner === undefined) throw new Error("Optional operation requires a finalized generic storage contract.");
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: method },
    arguments: [{ kind: "Argument", expression: value }] };
}

export function planCsharpAbsentValue(storage: TargetTypeRef, typeParameterNames?: ReadonlyMap<string, string>): CsharpExpression | undefined {
  if (getCsharpGenericOptionalParts(storage) !== undefined) {
    return planCsharpOptionalStorageOperation(storage, "From1", { kind: "LiteralExpression", value: null }, typeParameterNames);
  }
  if (!csharpCarrierAdmitsSourceAbsence(storage)) return undefined;
  const type = csharpTypeFromTargetTypeRef(storage, typeParameterNames);
  return type === undefined ? undefined : { kind: "DefaultExpression", type };
}

export function planCsharpStorageIsAbsent(
  storage: TargetTypeRef, value: CsharpExpression, typeParameterNames?: ReadonlyMap<string, string>,
): CsharpExpression | undefined {
  if (getCsharpGenericOptionalParts(storage) !== undefined) {
    return planCsharpOptionalStorageOperation(storage, "Is1", value, typeParameterNames);
  }
  if (isCsharpJsValueTargetType(storage)) return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: value, name: "isUndefined" }, arguments: [] };
  return csharpCarrierAdmitsSourceAbsence(storage) ? { kind: "NullPatternExpression", expression: value, negated: false } : undefined;
}

export function planCsharpPresentValueGuard(
  storage: TargetTypeRef, present: TargetTypeRef, value: CsharpExpression, name: string,
  typeParameterNames?: ReadonlyMap<string, string>,
): { readonly condition: CsharpExpression; readonly value: CsharpExpression } | undefined {
  const optional = getCsharpGenericOptionalParts(storage);
  if (!targetTypeRefEquals(optional?.element ?? getCsharpNullableElementTargetType(storage) ?? storage, present)) return undefined;
  const bound: CsharpExpression = { kind: "IdentifierName", name };
  if (optional !== undefined || isCsharpJsValueTargetType(storage)) {
    const absent = planCsharpStorageIsAbsent(storage, bound, typeParameterNames);
    if (absent === undefined) return undefined;
    return { condition: { kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
      left: { kind: "IsPatternExpression", expression: value, type: { kind: "IdentifierName", name: "var" }, designation: name },
      right: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: absent } },
      value: optional === undefined ? bound : planCsharpOptionalStorageOperation(storage, "As2", bound, typeParameterNames) };
  }
  const type = csharpTypeFromTargetTypeRef(present, typeParameterNames);
  return type === undefined ? undefined : { condition: { kind: "IsPatternExpression", expression: value, type, designation: name }, value: bound };
}
