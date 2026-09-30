import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "./binding-state.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

function optionalOperation(storage: TargetTypeRef, method: string, value: CsharpExpression): CsharpExpression {
  const optional = getCsharpGenericOptionalParts(storage);
  if (optional === undefined) throw new Error("Optional operation requires a finalized generic storage contract.");
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: optional.operations.name }, name: method },
    arguments: [{ kind: "Argument", expression: value }] };
}

export function planCsharpArrayBindingPresence(source: CsharpExpression, index: number, lengthMember: string): CsharpExpression {
  return { kind: "BinaryExpression",
    left: { kind: "SimpleMemberAccessExpression", receiver: source, name: lengthMember },
    operatorToken: { kind: "GreaterThanToken" }, right: { kind: "LiteralExpression", value: index } };
}

export function planCsharpCheckedBindingValue(
  value: CsharpExpression, present: CsharpExpression, element: TargetTypeRef, storageType: CsharpTypeNode,
): CsharpExpression {
  const storage = csharpNullableTargetType(element);
  const generic = getCsharpGenericOptionalParts(storage);
  const wrap = generic !== undefined && getCsharpGenericOptionalParts(element) === undefined;
  return { kind: "ConditionalExpression", condition: present,
    whenTrue: wrap ? optionalOperation(storage, "From2", value) : value,
    whenFalse: generic === undefined ? { kind: "DefaultExpression", type: storageType }
      : optionalOperation(storage, "From1", { kind: "LiteralExpression", value: null }) };
}

export function planCsharpBindingDefaultValue(
  value: CsharpExpression, carrier: TargetTypeRef, fallback: CsharpExpression, resultCarrier: TargetTypeRef, state: DestructuringPlannerState,
): CsharpExpression {
  if (isCsharpAbsenceTargetType(carrier)) return { kind: "SimpleMemberAccessExpression",
    receiver: { kind: "TupleExpression", elements: [value, fallback] }, name: "Item2" };
  if (getCsharpNullableElementTargetType(carrier) !== undefined) return {
    kind: "BinaryExpression", left: value, operatorToken: { kind: "QuestionQuestionToken" }, right: fallback,
  };
  const storage = csharpNullableTargetType(carrier);
  const generic = getCsharpGenericOptionalParts(storage);
  const broad = isCsharpJsValueTargetType(carrier);
  if (generic === undefined && !broad) return value;
  const name = allocateExpressionTemp(state);
  const reference: CsharpExpression = { kind: "IdentifierName", name };
  const stored = generic !== undefined && getCsharpGenericOptionalParts(carrier) === undefined
    ? optionalOperation(storage, "From2", value) : value;
  const absent: CsharpExpression = broad ? { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: reference, name: "isUndefined" }, arguments: [] }
    : optionalOperation(storage, "Is1", reference);
  return { kind: "ConditionalExpression", condition: {
    kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
    left: { kind: "IsPatternExpression", expression: stored, type: { kind: "IdentifierName", name: "var" }, designation: name },
    right: absent,
  }, whenTrue: fallback, whenFalse: broad || targetTypeRefEquals(storage, resultCarrier)
    ? reference : optionalOperation(storage, "As2", reference) };
}
