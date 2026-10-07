import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionMode } from "../../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpVoidReturnCompletion } from "../../../target-model/types/delegates.js";
import { applyCsharpConversionSelection, readCsharpConversionClassification } from "./conversions.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpAbsentValue } from "./optional-storage.js";

export function convertCsharpPlannedValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planned: CsharpPlannedValue,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  const source = planned.completion.carrier;
  if (targetTypeRefEquals(source, target)) return planned;
  if (planned.completion.kind === "void" && csharpVoidReturnCompletion(source, target) === "absence") {
    const absent = planCsharpAbsentValue(target, input.scope.typeParameterNames);
    return absent === undefined ? undefined : csharpPlannedValue(target, absent, planned.prelude);
  }
  const conversion = readCsharpConversionClassification(node, input, diagnostics, source, target, mode);
  return conversion === undefined ? undefined : mapCsharpPlannedValue(planned, target, value =>
    applyCsharpConversionSelection(node, sourceFile, input, diagnostics, source, target, conversion, value));
}
