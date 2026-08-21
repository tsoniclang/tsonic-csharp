import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
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

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const projectModuleMember = tryPlanProjectSourceModuleStaticMemberReference(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
  );
  if (projectModuleMember !== undefined) {
    return projectModuleMember;
  }
  return translateCsharpPropertyAccess(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
}
