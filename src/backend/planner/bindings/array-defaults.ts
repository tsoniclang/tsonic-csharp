import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArrayBindingCarrier, TargetTypeRef } from "../../../target-model/types/index.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import type { DestructuringPlannerState } from "./binding-state.js";

export function planArrayDefaultProjection(
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  index: number,
  projected: CsharpExpression,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpression: BindingDefaultExpressionPlanner,
): { readonly expression: CsharpExpression; readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode } | undefined {
  const sourceType = sourceNode === undefined ? undefined : input.program.sourceEvidence.expressionType(sourceNode);
  const behavior = sourceType === undefined ? undefined
    : input.program.sourceEvidence.semanticType(sourceType, sourceFile)?.arrayElementDefault;
  if (behavior === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer,
      "Array destructuring defaults require a finalized native absence contract for the element."));
    return undefined;
  }
  const nullableElement = getCsharpNullableElementTargetType(sourceCarrier.element);
  const defaultOnNull = behavior === "nullable" && nullableElement !== undefined;
  const carrier = defaultOnNull ? nullableElement
    : behavior === "always" ? input.program.sourceEvidence.nodeTargetType(initializer) : sourceCarrier.element;
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
  if (carrier === undefined || type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Array default requires a renderable finalized element carrier."));
    return undefined;
  }
  const defaultValue = planDefaultExpression(initializer, sourceFile, input, diagnostics, type, initializer, state);
  if (defaultValue === undefined) return undefined;
  if (behavior === "always") return { expression: defaultValue, carrier, type };
  const presentValue: CsharpExpression = defaultOnNull ? {
    kind: "BinaryExpression", left: projected,
    operatorToken: { kind: "QuestionQuestionToken" }, right: defaultValue,
  } : projected;
  return {
    carrier, type,
    expression: {
      kind: "ConditionalExpression",
      condition: {
        kind: "BinaryExpression",
        left: { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: sourceCarrier.lengthMember },
        operatorToken: { kind: "GreaterThanToken" },
        right: { kind: "LiteralExpression", value: index },
      },
      whenTrue: presentValue,
      whenFalse: defaultValue,
    },
  };
}
