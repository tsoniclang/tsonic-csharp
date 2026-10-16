import type { Node } from "@tsonic/tsts";
import type { CsharpNativeUseContext, CsharpNativeUseSlot } from "../../../target-model/records/native-demand.js";
import { csharpNativeUseSite } from "../../../target-model/records/native-demand.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function readCsharpNativeUse(
  input: CsharpPlanningContext,
  owner: Node,
  slot: CsharpNativeUseSlot,
  context: CsharpNativeUseContext = {},
) {
  return input.program.records.nativeUse.get(csharpNativeUseSite(owner, slot, context));
}

export function readCsharpNativeExpressionUse(input: CsharpPlanningContext, expression: Node) {
  return input.program.records.nativeUse.expression(expression);
}

export function requireCsharpNativeExpressionUse(input: CsharpPlanningContext, expression: Node) {
  return readCsharpNativeExpressionUse(input, expression) ?? failCsharpPlannerInvariant(
    "A planned source expression requires its exact pre-seal native emission context.", expression);
}
