import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../planning-data.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { type CsharpPlannedCapture } from "./planned-values.js";

export function captureCsharpPlannedValue(
  node: Node,
  input: CsharpPlanningContext,
  carrier: TargetTypeRef,
): CsharpPlannedCapture | undefined {
  const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (type === undefined) {
    failCsharpPlannerInvariant("An admitted ordered evaluation requires its exact native temporary carrier.", node);
  }
  return { type, name: input.names.temporaryName(`__tsonic_value_${input.program.source.ast.pos(node)}`) };
}
