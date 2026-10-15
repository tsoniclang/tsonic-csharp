import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/index.js";
import { selectCsharpArrayLiteralCarrier } from "../../policy/types/collections/literal-construction.js";
import { getCsharpArrayLiteralElementTargetType } from "../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";

export function canConstructCsharpStorageLiteral(
  expression: Node,
  required: TargetTypeRef,
  policy: Pick<CsharpPolicyContext, "ast" | "typeDefinitions">,
  evidence: Pick<CsharpSourceEvidenceIndex, "nodeTargetType">,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget" | "resolveObjectLiteralTargetShape">,
  conversions: Pick<CsharpConversionClassifications, "expressionConversion">,
): boolean {
  if (policy.ast.is.IsObjectLiteralExpression(expression)) {
    const shape = shapes.resolveTarget(required);
    return shape !== undefined && shapes.resolveObjectLiteralTargetShape(shape, expression)?.kind === "resolved";
  }
  if (!policy.ast.is.IsArrayLiteralExpression(expression)) return false;
  const carrier = selectCsharpArrayLiteralCarrier(required, evidence.nodeTargetType.get(expression), policy.typeDefinitions);
  const elementType = getCsharpArrayLiteralElementTargetType(carrier);
  return carrier !== undefined && elementType !== undefined && targetTypeRefEquals(carrier, required) &&
    policy.ast.elements(expression).every(element => {
      if (element === undefined || policy.ast.is.IsSpreadElement(element)) return false;
      const selected = conversions.expressionConversion.get(element, evidence.nodeTargetType.get(element), elementType, "implicit");
      return selected !== undefined && csharpConversionIsApplicable(selected, "implicit");
    });
}
