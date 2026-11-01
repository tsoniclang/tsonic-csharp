import { targetTypeRefEquals } from "../../dist/target-model/types/equality.js";
import { csharpUnionArmMappingsEqual } from "../../dist/target-model/types/union-relations.js";

const operationComparators = Object.freeze({
  sequence: (left, right) => left.resultUse === right.resultUse,
  "conditional-value": (left, right) => left.operator === right.operator && left.branch === right.branch,
  "closed-value-coalesce": (left, right) => left.assignment === right.assignment && left.location === right.location,
  "bigint-call": (left, right) => left.method === right.method && left.assignment === right.assignment && left.location === right.location,
  "array-index-presence": () => true,
  "nullish-equality": (left, right) => left.value === right.value,
  "union-coalesce": (left, right) => left.valueArmIndex === right.valueArmIndex && left.retainCarrier === right.retainCarrier,
  "union-equality": (left, right) => left.negated === right.negated && csharpUnionEqualityArmsEqual(left.arms, right.arms),
  operator: (left, right) => left.operator === right.operator,
  "generic-numeric": (left, right) => left.operator === right.operator && left.zeroOperand === right.zeroOperand && targetTypeRefEquals(left.carrier, right.carrier),
  "string-ordinal-relational": (left, right) => left.operator === right.operator,
  "nullish-test": (left, right) => left.operand === right.operand && left.negated === right.negated &&
    (left.unionArmIndexes === undefined ? right.unionArmIndexes === undefined
      : right.unionArmIndexes !== undefined && left.unionArmIndexes.length === right.unionArmIndexes.length &&
        left.unionArmIndexes.every((arm, index) => arm === right.unionArmIndexes[index])),
  "reference-identity": (left, right) => left.negated === right.negated && left.distinctMethodValues === right.distinctMethodValues,
});

export function csharpBinarySelectionsEqual(left, right) {
  for (const selected of [left, right]) {
    if (selected.kind !== "resolved" && selected.kind !== "rejected") throw new TypeError(`Unknown binary selection kind: ${selected.kind}`);
    if (selected.kind === "resolved") requireOperationComparator(selected.targetOperation);
  }
  if (left.kind !== right.kind) return false;
  if (left.kind === "rejected") return left.reason === right.reason;
  return left.sourceOperator === right.sourceOperator && left.left === right.left && left.right === right.right &&
    csharpBinaryTargetOperationsEqual(left.targetOperation, right.targetOperation) &&
    targetTypeRefEquals(left.leftType, right.leftType) && targetTypeRefEquals(left.rightType, right.rightType) &&
    targetTypeRefEquals(left.leftInputType, right.leftInputType) && targetTypeRefEquals(left.rightInputType, right.rightInputType) &&
    targetTypeRefEquals(left.resultType, right.resultType);
}

function requireOperationComparator(operation) {
  if (!Object.hasOwn(operationComparators, operation.kind)) throw new TypeError(`Unknown binary target operation kind: ${operation.kind}`);
  return operationComparators[operation.kind];
}

function csharpBinaryTargetOperationsEqual(left, right) {
  const compare = requireOperationComparator(left);
  requireOperationComparator(right);
  return left.kind === right.kind && compare(left, right);
}

export function csharpUnionEqualityArmsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  for (const arm of [...left, ...right]) {
    if (arm == null || arm.left == null || arm.right == null || arm.operation == null ||
      arm.left.carrier == null || arm.right.carrier == null) return false;
    if (arm.operation.kind !== "operator" && arm.operation.kind !== "reference-identity") {
      throw new TypeError(`Unknown union equality operation kind: ${arm.operation.kind}`);
    }
  }
  return left.length === right.length && left.every((arm, index) => {
    const selected = right[index];
    const sameSide = (left, right) => csharpUnionArmMappingsEqual(
      [{ carrier: left.carrier, source: left.path, target: [] }],
      [{ carrier: right.carrier, source: right.path, target: [] }],
    );
    if (!sameSide(arm.left, selected.left) || !sameSide(arm.right, selected.right)) return false;
    const operation = arm.operation;
    const other = selected.operation;
    return operation.kind === "operator" ? other.kind === "operator" && other.leftInputType != null && other.rightInputType != null &&
      targetTypeRefEquals(operation.leftInputType, other.leftInputType) && targetTypeRefEquals(operation.rightInputType, other.rightInputType)
      : other.kind === "reference-identity" && operation.negated === other.negated && operation.distinctMethodValues === other.distinctMethodValues;
  });
}
