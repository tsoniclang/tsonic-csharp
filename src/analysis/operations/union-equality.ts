import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpUnionEqualityOperand } from "../../target-model/records/operations/union-equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, csharpSourcePrimitiveTargetType } from "../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { createCsharpUnionEqualityProducer } from "../program/records/operations/union-equality.js";

export function analyzeCsharpUnionEquality(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  exact: CsharpExactLiteralSelectionIndex) {
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
    const operand = (expression: Node, arm: CsharpUnionEqualityOperand["arm"], storage: TargetTypeRef,
      inputType: TargetTypeRef | undefined): CsharpUnionEqualityOperand => {
      if (arm.path.length === 0 && inputType !== undefined) {
        const selected = exact.exactLiteral.get(expression, inputType);
        if (selected === undefined || selected.kind === "rejected") return failTargetAnalysisInvariant("tsonic-csharp",
          "An admitted union comparison requires its exact literal endpoint.", expression);
        if (selected.kind === "resolved") return Object.freeze({ arm, form: "literal", literal: selected.recipe });
      }
      return Object.freeze({ arm, form: arm.path.length !== 0 ? "union" : isCsharpAbsenceTargetType(arm.carrier) ? "absence"
        : getCsharpNullableElementTargetType(storage) === undefined ? "union" : "present" });
    };
    producer.publish(node, { left: selection.left, right: selection.right, leftType: selection.leftType, rightType: selection.rightType,
      result: selection.resultType, negated: operation.negated, arms: Object.freeze(operation.arms.map(arm => {
        const left = operand(selection.left, arm.left, selection.leftType,
          arm.operation.kind === "operator" ? arm.operation.leftInputType : undefined);
        const right = operand(selection.right, arm.right, selection.rightType,
          arm.operation.kind === "operator" ? arm.operation.rightInputType : undefined);
        return Object.freeze({ left, right, operation: arm.operation,
          castLeft: arm.operation.kind === "operator" && left.form !== "literal" && !targetTypeRefEquals(arm.left.carrier, arm.operation.leftInputType),
          castRight: arm.operation.kind === "operator" && right.form !== "literal" && !targetTypeRefEquals(arm.right.carrier, arm.operation.rightInputType),
        });
      })) });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
