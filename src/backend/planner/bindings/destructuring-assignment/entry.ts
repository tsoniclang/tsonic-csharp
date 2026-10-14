import { allocateDestructuringTemp } from "../binding-state.js";
import { csharpDestructuringAssignmentSyntax } from "../../../../target-model/syntax/operators.js";
import { planAssignmentPatternFromExpression } from "./planning.js";
import { getCsharpTypeForExpressionCarrier } from "../binding-patterns.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { missingBindingPatternProjectionMessage } from "../binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "../binding-array-patterns.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../binding-state.js";
import type { ExpressionPlanner } from "../../expressions/expression-planner-types.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../expressions/planned-values.js";
import { planCsharpPlannedDiscard } from "../../statements/statement-output.js";

export const missingDestructuringAssignmentFactsMessage = "Destructuring assignment emission requires finalized target storage and extraction facts before C# emission.";

export function isDestructuringAssignmentExpression(
  node: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  return csharpDestructuringAssignmentSyntax(input.program.source.ast, node) !== undefined;
}

export function pushMissingDestructuringAssignmentFactsDiagnostic(
  node: Node,
  diagnostics: TargetDiagnostic[],
): void {
  diagnostics.push(unsupportedNodeDiagnostic(node, missingDestructuringAssignmentFactsMessage));
}

export function planDestructuringAssignmentStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  const planned = planDestructuringAssignmentCore(
    node!,
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
    planDefaultExpressionWithExpectedType,
  );
  return planned === undefined ? [] : planCsharpPlannedDiscard(planned);
}

export function tryPlanDestructuringAssignmentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  if (state === undefined) {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  const planned = planDestructuringAssignmentCore(
    node,
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
    planDefaultExpressionWithExpectedType,
  );
  if (planned === undefined) {
    return undefined;
  }
  return planned;
}

function planDestructuringAssignmentCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): CsharpPlannedValue | undefined {
  const selectedOperator = input.program.records.binaryOperation.get(node)
    ?.destructuring;
  if (selectedOperator === undefined) {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  if (selectedOperator.kind !== "resolved") {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  const left = selectedOperator.pattern;
  const right = selectedOperator.source;
  const pattern = input.program.records.bindingPatternProjection.get(node)?.assignmentPattern;
  if (pattern === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(left, missingBindingPatternProjectionMessage));
    return undefined;
  }
  const sourceExpression = planExpression(right, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return undefined;
  }
  if (sourceExpression.completion.kind === "never") return sourceExpression;
  if (sourceExpression.completion.kind !== "value") return undefined;
  const sourceType = getCsharpTypeForExpressionCarrier(right, sourceFile, input, diagnostics, left, "Destructuring assignment source");
  const tempName = allocateDestructuringTemp(state);
  const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
  return csharpPlannedValue(sourceExpression.completion.carrier, tempReference, [
    ...sourceExpression.prelude,
    {
      kind: "LocalDeclarationStatement",
      name: tempName,
      type: sourceType,
      initializer: sourceExpression.completion.expression,
    },
    ...planAssignmentPatternFromExpression(
      pattern,
      tempReference,
      sourceFile,
      input,
      diagnostics,
      state,
      planDefaultExpressionWithExpectedType,
    ),
    ]);
}
