import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpTaskResultTargetType } from "../../../target-model/types/delegates.js";
import { isCsharpDestructuringAssignmentPattern, isCsharpAssignmentOperator, sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";
import { selectCsharpNumericBinaryPromotion } from "../../operations/numeric/promotion.js";
import { sourcePrimitiveImplicitlyConverts } from "../../conversions/source-primitives.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function resolveBinaryTargetRepresentation(
  ast: AstReader,
  operator: ReturnType<typeof sourceOperatorFromKindName>,
  leftNode: Node | undefined,
  left: TargetTypeRef | undefined,
  rightNode: Node | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (operator === undefined || left === undefined || right === undefined) {
    return undefined;
  }
  if (isCsharpAssignmentOperator(operator)) {
    return operator === "=" &&
        isCsharpDestructuringAssignmentPattern(ast, leftNode)
      ? right
      : left;
  }
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "in":
    case "instanceof":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case ",":
      return right;
    case "<<":
    case ">>":
    case ">>>":
      return left;
    case "??": {
      const nonNullableLeft = getNonNullableTargetRepresentation(left);
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { ast },
            leftNode,
            nonNullableLeft,
            rightNode,
            right,
          );
      return numeric?.resultType ??
        commonTargetRepresentation(nonNullableLeft, right);
    }
    default: {
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { ast },
            leftNode,
            left,
            rightNode,
            right,
          );
      return numeric?.resultType ?? commonTargetRepresentation(left, right);
    }
  }
}


export function commonTargetRepresentation(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(left, right)) {
    return left;
  }
  if (sourcePrimitiveImplicitlyConverts(right, left)) {
    return right;
  }
  if (sourcePrimitiveImplicitlyConverts(left, right)) {
    return left;
  }
  return undefined;
}


export function getNonNullableTargetRepresentation(
  type: TargetTypeRef,
): TargetTypeRef {
  return getCsharpNullableElementTargetType(type) ?? type;
}


export function getTaskResultType(
  type: TargetTypeRef,
): TargetTypeRef | undefined {
  return getCsharpTaskResultTargetType(type);
}
