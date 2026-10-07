import type { CsharpTargetBinaryOperation, selectCsharpBinaryOperation } from "../../policy/operations/index.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpUnionEqualityArmsEqual } from "../../target-model/operations/binary.js";

export function csharpBinarySelectionsEqual(
  left: ReturnType<typeof selectCsharpBinaryOperation>,
  right: ReturnType<typeof selectCsharpBinaryOperation>,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "rejected" || right.kind === "rejected") {
    return left.kind === "rejected" && right.kind === "rejected" && left.reason === right.reason;
  }
  return left.sourceOperator === right.sourceOperator && left.left === right.left && left.right === right.right &&
    csharpBinaryTargetOperationsEqual(left.targetOperation, right.targetOperation) &&
    targetTypeRefEquals(left.leftType, right.leftType) && targetTypeRefEquals(left.rightType, right.rightType) &&
    targetTypeRefEquals(left.leftInputType, right.leftInputType) && targetTypeRefEquals(left.rightInputType, right.rightInputType) &&
    targetTypeRefEquals(left.resultType, right.resultType);
}

function csharpBinaryTargetOperationsEqual(left: CsharpTargetBinaryOperation, right: CsharpTargetBinaryOperation): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "sequence":
      return right.kind === "sequence" && left.resultUse === right.resultUse;
    case "conditional-value":
      return right.kind === "conditional-value" && left.operator === right.operator && left.branch === right.branch;
    case "closed-value-coalesce":
      return right.kind === "closed-value-coalesce" && left.assignment === right.assignment && left.location === right.location;
    case "bigint-call":
      return right.kind === "bigint-call" && left.method === right.method &&
        left.assignment === right.assignment && left.location === right.location;
    case "array-index-presence":
      return right.kind === "array-index-presence";
    case "nullish-equality":
      return right.kind === "nullish-equality" && left.value === right.value;
    case "union-coalesce":
      return right.kind === "union-coalesce" && left.valueArmIndex === right.valueArmIndex && left.retainCarrier === right.retainCarrier;
    case "union-equality":
      return right.kind === "union-equality" && left.negated === right.negated && csharpUnionEqualityArmsEqual(left.arms, right.arms);
    case "operator":
      return right.kind === "operator" && left.operator === right.operator;
    case "generic-numeric":
      return right.kind === "generic-numeric" && left.operator === right.operator &&
        left.zeroOperand === right.zeroOperand && targetTypeRefEquals(left.carrier, right.carrier);
    case "string-ordinal-relational":
      return right.kind === "string-ordinal-relational" && left.operator === right.operator;
    case "nullish-test":
      return right.kind === "nullish-test" && left.operand === right.operand && left.negated === right.negated &&
        (left.unionArmIndexes === undefined ? right.unionArmIndexes === undefined
          : right.unionArmIndexes !== undefined && left.unionArmIndexes.length === right.unionArmIndexes.length &&
            left.unionArmIndexes.every((arm, index) => arm === right.unionArmIndexes![index]));
    case "reference-identity":
      return right.kind === "reference-identity" && left.negated === right.negated;
  }
}
