import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/index.js";
import { selectCsharpArrayLiteralCarrier } from "../../policy/types/collections/literal-construction.js";
import { getCsharpArrayLiteralElementTargetType } from "../../target-model/types/collections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionClassifications } from "../conversions/index.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";

export function canConstructCsharpStorageLiteral(
  expression: Node,
  required: TargetTypeRef,
  policy: Pick<CsharpPolicyContext, "ast" | "typeDefinitions">,
  evidence: Pick<CsharpSourceEvidenceIndex, "nodeTargetType">,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget" | "resolveObjectLiteralTargetShape">,
  conversions: Pick<CsharpConversionClassifications, "selectExpression">,
): boolean {
  if (policy.ast.is.IsObjectLiteralExpression(expression)) {
    const shape = shapes.resolveTarget(required);
    return shape !== undefined && shapes.resolveObjectLiteralTargetShape(shape, expression)?.kind === "resolved";
  }
  if (!policy.ast.is.IsArrayLiteralExpression(expression)) return false;
  const carrier = selectCsharpArrayLiteralCarrier(required, evidence.nodeTargetType(expression), policy.typeDefinitions);
  const elementType = getCsharpArrayLiteralElementTargetType(carrier);
  return carrier !== undefined && elementType !== undefined && targetTypeRefEquals(carrier, required) &&
    policy.ast.elements(expression).every(element => {
      if (element === undefined || policy.ast.is.IsSpreadElement(element)) return false;
      const selected = conversions.selectExpression(element, evidence.nodeTargetType(element), elementType, "implicit");
      return selected !== undefined && csharpConversionIsApplicable(selected, "implicit");
    });
}
