import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planCsharpArrayConstruction } from "./construction.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planNativeCollectionArrayLiteralExpression(node: Node, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], carrier: TargetTypeRef,
  elementCarrier: TargetTypeRef, planner: ArrayLiteralPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.arrayLiteral.get(node, carrier);
  const construction = selected?.construction;
  if (construction === undefined) failCsharpPlannerInvariant("An admitted native collection requires its exact builder contract.", node);
  const elementType = csharpTypeFromTargetTypeRef(elementCarrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted native collection requires its element type.", node);
  const type = csharpTypeFromTargetTypeRef(construction.carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted native collection requires its construction type.", node);
  return planCsharpArrayConstruction(node, sourceFile, input, diagnostics, elementType, elementCarrier, planner,
    { carrier: construction.carrier, type, builder: construction.builder });
}
