import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type { CsharpMemberReceiverProjection } from "../../../analysis/operations/index.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { getCsharpTypeFromProjectSourceReference } from "../types/project-source-types.js";
import type { CsharpTypeNode } from "../../target-ast/roslyn/index.js";

export interface CsharpSelectedReceiverEvidence {
  readonly expression: Node;
  readonly type: Type;
  readonly valueDeclaration?: Node;
}

export function csharpProjectTypeReceiver(
  receiver: CsharpSelectedReceiverEvidence,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const declaration = receiver.valueDeclaration ??
    input.program.sourceNavigation.sourceReferenceFor(receiver.expression)?.declaration;
  if (declaration === undefined) return undefined;
  const reference = input.program.sourceNavigation.referenceFor(receiver.valueDeclaration === undefined
    ? receiver.expression : input.program.source.ast.name(declaration));
  return reference === undefined || reference.declaration !== declaration || input.program.classFactories.get(declaration) !== undefined
    ? undefined : getCsharpTypeFromProjectSourceReference(reference, input, diagnostics);
}

export function translateCsharpSelectedReceiver(
  receiver: CsharpSelectedReceiverEvidence,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  projection?: CsharpMemberReceiverProjection,
): CsharpPlannedValue | undefined {
  const projectType = csharpProjectTypeReceiver(receiver, input, diagnostics);
  let expression: CsharpPlannedValue | undefined;
  if (projectType !== undefined) {
    const carrier = input.types.classifications.resolveNode(receiver.expression, sourceFile);
    if (carrier === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(receiver.expression,
        "A project type receiver requires its exact selected native value contract."));
      return undefined;
    }
    expression = csharpPlannedValue(carrier, projectType);
  } else {
    expression = planExpression(receiver.expression, sourceFile, input, diagnostics);
  }
  if (projection === undefined || expression === undefined || expression.completion.kind === "never") return expression;
  if (projection.conversion.kind !== "rejected" && expression.completion.kind === "value" &&
    targetTypeRefEquals(expression.completion.carrier, projection.target)) return expression;
  if (expression.completion.kind !== "value" || !targetTypeRefEquals(expression.completion.carrier, projection.source)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver.expression,
      "A selected C# receiver projection conflicts with its exact planned completion carrier."));
    return undefined;
  }
  return mapCsharpPlannedValue(expression, projection.target, value =>
    applyCsharpConversionSelection(receiver.expression, sourceFile, input, diagnostics,
      projection.source, projection.target, projection.conversion, value));
}
