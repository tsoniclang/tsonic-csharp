import type { AstReader } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
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
    if (operation === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# planning received a void expression without a sealed operation classification.", node);
    const refusal: { readonly code: `CSHARP_${string}`; readonly message: string } | undefined = operation.kind === "rejected"
      ? { code: operation.code, message: operation.reason }
      : operand === undefined || operandType === undefined || !selectCsharpTypeEmission({ carrier })
        ? { code: "CSHARP_VOID_CARRIER_NOT_RENDERABLE", message: "C# void translation requires exact sealed operand and result carriers." }
      : !isCsharpVoidTargetType(carrier) && !csharpCarrierAdmitsSourceAbsence(carrier) && getCsharpGenericOptionalParts(carrier) === undefined
        ? { code: "CSHARP_VOID_RESULT_NOT_ABSENT", message: "The selected C# void result cannot represent undefined." } : undefined;
    if (refusal !== undefined) issues.push({ code: refusal.code, category: "error", source: "tsonic-csharp", sourceNode: node, message: refusal.message });
  }
  return Object.freeze(issues);
}
