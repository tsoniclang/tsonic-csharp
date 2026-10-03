import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCallResult } from "../../../../../policy/types/resolution/model.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/equality.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpVoidReturnCompletion } from "../../../../../target-model/types/delegates.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "../../planned-values.js";
import { planCsharpAbsentValue } from "../../optional-storage.js";

export function planCsharpSelectedSourceCallResult(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  result: CsharpSourceCallResult,
  invocation: CsharpPlannedValue,
): CsharpPlannedValue | undefined {
  if (invocation.completion.kind === "never") return invocation;
  if (targetTypeRefEquals(result.nativeType, result.selectedType)) return invocation;
  if (invocation.completion.kind === "void" && csharpVoidReturnCompletion(result.nativeType, result.selectedType) === "absence") {
    const absent = planCsharpAbsentValue(result.selectedType, input.scope.typeParameterNames);
    return absent === undefined ? undefined : csharpPlannedValue(result.selectedType, absent, invocation.prelude);
  }
  const conversion = input.program.conversions.select(result.nativeType, result.selectedType, "explicit");
  if (conversion === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A source call result has no sealed native-to-selected conversion."));
    return undefined;
  }
  return mapCsharpPlannedValue(invocation, result.selectedType, value => applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
    result.nativeType, result.selectedType, conversion, value));
}
