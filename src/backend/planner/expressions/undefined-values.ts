import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  csharpConversionIsApplicable,
} from "../../../analysis/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpAbsenceTargetType,
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  applyCsharpConversionSelection,
  readCsharpExpressionConversionClassification,
} from "./conversions.js";

export type CsharpSourceUndefinedValuePlan =
  | {
      readonly kind: "resolved";
      readonly expression: CsharpExpression;
    }
  | { readonly kind: "not-representable" };

export function planCsharpSourceUndefinedValue(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpSourceUndefinedValuePlan {
  if (getCsharpNullableElementTargetType(targetType) !== undefined) {
    return {
      kind: "resolved",
      expression: { kind: "LiteralExpression", value: null },
    };
  }
  const sourceType = csharpAbsenceTargetType();
  const selection = readCsharpExpressionConversionClassification(
    node,
    input,
    diagnostics,
    sourceType,
    targetType,
    "implicit",
  );
  if (
    selection === undefined ||
    !csharpConversionIsApplicable(selection, "implicit")
  ) {
    return { kind: "not-representable" };
  }
  const expression = applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceType,
    targetType,
    selection,
    { kind: "LiteralExpression", value: null },
  );
  return expression === undefined
    ? { kind: "not-representable" }
    : { kind: "resolved", expression };
}
