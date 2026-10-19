import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpLiteralIsRepresentableAs } from "../conversions/literals.js";
import { selectCsharpNumericBinaryPromotion } from "../operations/numeric/promotion.js";

export function selectCsharpConditionalNumericCarrier(
  whenTrue: Node,
  whenFalse: Node,
  trueCarrier: TargetTypeRef | undefined,
  falseCarrier: TargetTypeRef | undefined,
  literalValues: SourceLiteralIndex,
): TargetTypeRef | undefined {
  const trueElement = getCsharpNullableElementTargetType(trueCarrier);
  const falseElement = getCsharpNullableElementTargetType(falseCarrier);
  const left = trueElement ?? trueCarrier;
  const right = falseElement ?? falseCarrier;
  const optional = trueElement !== undefined || falseElement !== undefined ||
    isCsharpAbsenceTargetType(left) || isCsharpAbsenceTargetType(right);
  let selected: TargetTypeRef | undefined;
  if (isCsharpAbsenceTargetType(left) && right !== undefined && isCsharpIntegralTargetType(right)) selected = right;
  else if (isCsharpAbsenceTargetType(right) && left !== undefined && isCsharpIntegralTargetType(left)) selected = left;
  else if (left !== undefined && right !== undefined && isCsharpIntegralTargetType(left) && isCsharpIntegralTargetType(right)) {
    selected = targetTypeRefEquals(left, right) ? left
      : selectCsharpNumericBinaryPromotion({ literalValues }, whenTrue, left, whenFalse, right)?.resultType;
  } else if (left !== undefined && isCsharpIntegralTargetType(left) && csharpLiteralIsRepresentableAs(literalValues.literalValue.get(whenFalse), left)) {
    selected = left;
  } else if (right !== undefined && isCsharpIntegralTargetType(right) && csharpLiteralIsRepresentableAs(literalValues.literalValue.get(whenTrue), right)) {
    selected = right;
  }
  return selected === undefined ? undefined : optional ? csharpNullableTargetType(selected) : selected;
}
