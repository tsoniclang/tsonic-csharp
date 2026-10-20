import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceArgumentEmissionGroup } from "../../../target-model/records/source-call-emission.js";
import { csharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { applyCsharpConversionSelection } from "./conversions.js";

export function planCsharpSourceUndefinedValue(node: Node, plan: Extract<CsharpSourceArgumentEmissionGroup, { readonly kind: "absence" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpExpression {
  const absence: CsharpExpression = { kind: "LiteralExpression", value: null };
  return plan.literal ? absence : applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
    csharpAbsenceTargetType(), plan.type, plan.conversion, absence) ?? failCsharpPlannerInvariant("An admitted omitted argument requires its exact native absence conversion.", node);
}
