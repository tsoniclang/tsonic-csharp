import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
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
  if (getCsharpNullableElementTargetType(storage) === undefined && !isCsharpAbsenceTargetType(storage) && !isCsharpJsValueTargetType(storage)) return undefined;
  const type = csharpTypeFromTargetTypeRef(storage, typeParameterNames);
  return type === undefined ? undefined : { kind: "DefaultExpression", type };
}
