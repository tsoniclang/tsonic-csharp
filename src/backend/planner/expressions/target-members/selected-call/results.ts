import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCallResult } from "../../../../../policy/types/resolution/model.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/equality.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";

export function planCsharpSelectedSourceCallResult(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  result: CsharpSourceCallResult,
  invocation: CsharpExpression,
): CsharpExpression | undefined {
  if (targetTypeRefEquals(result.nativeType, result.selectedType)) return invocation;
  const conversion = input.program.conversions.select(result.nativeType, result.selectedType, "explicit");
  if (conversion === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A source call result has no sealed native-to-selected conversion."));
    return undefined;
  }
  return applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
    result.nativeType, result.selectedType, conversion, invocation);
}
