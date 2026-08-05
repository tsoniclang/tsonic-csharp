import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  csharpConversionIsApplicable,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpRuntimeUndefinedTargetType,
  getCsharpNullableElementTargetType,
} from "../../policy/types/index.js";
import type {
  CsharpExpression,
} from "../../backend/roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import {
  applyCsharpConversionSelection,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpSourceUndefinedValuePlan {
  if (getCsharpNullableElementTargetType(targetType) !== undefined) {
    return {
      kind: "resolved",
      expression: { kind: "LiteralExpression", value: null },
    };
  }
  const sourceType = csharpRuntimeUndefinedTargetType();
  const sourceRender = csharpTypeFromTargetTypeRef(sourceType);
  if (sourceRender === undefined) {
    return { kind: "not-representable" };
  }
  const selection = selectCsharpConversion(
    input,
    sourceType,
    targetType,
    "implicit",
  );
  if (!csharpConversionIsApplicable(selection, "implicit")) {
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
    {
      kind: "SimpleMemberAccessExpression",
      receiver: sourceRender,
      name: "value",
    },
  );
  return expression === undefined
    ? { kind: "not-representable" }
    : { kind: "resolved", expression };
}
