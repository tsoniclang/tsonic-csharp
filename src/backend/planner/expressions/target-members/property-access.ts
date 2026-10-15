import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import {
  translateCsharpPropertyAccess,
} from "./selected-property.js";
import {
  tryPlanProjectSourceModuleStaticMemberReference,
} from "../expression-source-references.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { planCsharpExpressionCompletion } from "../planned-value-composition.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const projectModuleMember = tryPlanProjectSourceModuleStaticMemberReference(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
  );
  if (projectModuleMember !== undefined) {
    return planCsharpExpressionCompletion(propertyAccess, sourceFile, input, diagnostics, projectModuleMember);
  }
  return translateCsharpPropertyAccess(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
}
