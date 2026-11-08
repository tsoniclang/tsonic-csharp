import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../planning-data.js";
import {
  translateCsharpPropertyAccess,
} from "./selected-property.js";
import {
  tryPlanProjectSourceModuleStaticMemberReference,
} from "./expression-source-references.js";
import type { ExpressionPlanner } from "../planning-data.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion } from "./expression-completions.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";

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
    const planned = planCsharpExpressionCompletion(propertyAccess, sourceFile, input, diagnostics, projectModuleMember,
      readCsharpNativeExpressionCarrier(input, propertyAccess));
    return planned === undefined ? undefined : { ...planned, address: { kind: "root" } };
  }
  return translateCsharpPropertyAccess(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
}
