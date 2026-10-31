import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionMode } from "../../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { applyCsharpConversionSelection, readCsharpExpressionOperandStability, readCsharpConversionClassification } from "./conversions.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpAbsentValue } from "./optional-storage.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function convertCsharpPlannedValue(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planned: CsharpPlannedValue, target: TargetTypeRef,
  mode: CsharpConversionMode): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  const source = planned.completion.carrier;
  if (targetTypeRefEquals(source, target)) return planned;
  if (planned.completion.kind === "void") {
    const storage = input.program.records.typeEmission.get(target)?.optionalStorage
      ?? failCsharpPlannerInvariant("An admitted void conversion requires its selected native destination storage.", node);
    if (storage.kind === "generic" || storage.absence) {
      const absent = planCsharpAbsentValue(target, input)
        ?? failCsharpPlannerInvariant("An admitted void conversion requires its native absence value.", node);
      return csharpPlannedValue(target, absent, planned.prelude);
    }
  }
  const conversion = readCsharpConversionClassification(node, input, diagnostics, source, target, mode);
  const converted = conversion === undefined ? undefined : mapCsharpPlannedValue(planned, target, (value, prelude) =>
    applyCsharpConversionSelection(node, sourceFile, input, diagnostics, source, target, conversion, value, prelude, readCsharpExpressionOperandStability(node, input, source, target, mode, conversion), planned.absent === true, planned.callable));
  return converted === undefined || conversion?.kind !== "delegate-adapter" || conversion.strategy !== "native-binding"
    ? converted : { ...converted, callable: planned.callable?.kind === "lambda" ? planned.callable : { kind: "method" } };
}
