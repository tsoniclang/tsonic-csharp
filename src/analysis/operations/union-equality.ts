import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpUnionEqualityOperand } from "../../target-model/records/operations/union-equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, csharpSourcePrimitiveTargetType } from "../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { createCsharpUnionEqualityProducer } from "../program/records/operations/union-equality.js";

export function analyzeCsharpUnionEquality(nodes: readonly Node[], operations: CsharpTargetOperationClassifications) {
  const producer = createCsharpUnionEqualityProducer();
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    const selection = operations.binaryOperation.get(node)?.target;
    if (selection?.kind !== "resolved" || selection.targetOperation.kind !== "union-equality") continue;
    const operation = selection.targetOperation;
    if (!targetTypeRefEquals(selection.resultType, csharpSourcePrimitiveTargetType("bool")) ||
      selection.sourceOperator !== (operation.negated ? "!==" : "===")) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Union equality requires sealed native operations and a hygienic evaluation scope." }); continue;
    }
    const operand = (arm: CsharpUnionEqualityOperand["arm"], storage: TargetTypeRef): CsharpUnionEqualityOperand => Object.freeze({ arm,
      form: arm.path.length !== 0 ? "union" : isCsharpAbsenceTargetType(arm.carrier) ? "absence"
        : getCsharpNullableElementTargetType(storage) === undefined ? "union" : "present" });
    producer.publish(node, { left: selection.left, right: selection.right, leftType: selection.leftType, rightType: selection.rightType,
      result: selection.resultType, negated: operation.negated, arms: Object.freeze(operation.arms.map(arm => Object.freeze({
        left: operand(arm.left, selection.leftType), right: operand(arm.right, selection.rightType), operation: arm.operation,
        castLeft: arm.operation.kind === "operator" && !targetTypeRefEquals(arm.left.carrier, arm.operation.leftInputType),
        castRight: arm.operation.kind === "operator" && !targetTypeRefEquals(arm.right.carrier, arm.operation.rightInputType),
      }))) });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
