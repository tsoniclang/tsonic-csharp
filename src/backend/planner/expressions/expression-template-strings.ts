import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpInterpolatedStringPart } from "../../target-ast/syntax/index.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  requireCsharpStringRuntimeCarrier,
} from "./expression-literal-carriers.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "Template string emission")) {
    return undefined;
  }
  const selected = input.program.records.templateString.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted template requires its sealed source substitutions.", node);
  const operands: CsharpPlannedValue[] = [];
  const parts: (CsharpInterpolatedStringPart | number)[] = [
    { kind: "InterpolatedStringText", text: selected.head },
  ];
  for (const span of selected.parts) {
    const expression = planExpression(span.expression, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    parts.push(operands.length);
    operands.push(expression);
    parts.push({ kind: "InterpolatedStringText", text: span.literal });
  }
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, operands, expressions =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "InterpolatedStringExpression",
      parts: parts.map(part => typeof part === "number" ? { kind: "Interpolation", expression: expressions[part]! } : part) },
      readCsharpNativeExpressionCarrier(input, node)));
}
