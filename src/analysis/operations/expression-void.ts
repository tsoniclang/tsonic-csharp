import type { AstReader } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import { isCsharpVoidTargetType } from "../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";

export function analyzeCsharpVoidAdmission(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly values: CsharpValueReadClassifications; readonly operations: Pick<CsharpTargetOperationClassifications, "jsVoid"> }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased" || !input.ast.is.IsVoidExpression(use.expression)) continue;
    const node = use.expression;
    const operand = input.ast.as.AsVoidExpression(node)?.Expression;
    const operation = input.operations.jsVoid.get(node);
    const operandType = operand === undefined ? undefined : input.values.valueRead.get(operand)?.value;
    const carrier = use.carrier;
    const message = operation === undefined
      ? "C# planning received a void expression without a sealed operation classification."
      : operation.kind === "rejected" ? operation.reason
      : operand === undefined || operandType === undefined || !selectCsharpTypeEmission({ carrier })
        ? "C# void translation requires exact sealed operand and result carriers."
      : !isCsharpVoidTargetType(carrier) && !csharpCarrierAdmitsSourceAbsence(carrier) && getCsharpGenericOptionalParts(carrier) === undefined
        ? "The selected C# void result cannot represent undefined." : undefined;
    if (message !== undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  }
  return Object.freeze(issues);
}
