import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import { getCsharpCollectionElementTargetType, getCsharpIndexableLengthMemberName } from "../../../../target-model/types/index.js";
import type { CsharpConversionSelection } from "../../../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { probeCarrierFromResolution, resolveRuntimeCarrierForExpression } from "../../types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export interface CsharpArraySpreadInput {
  readonly carrier: TargetTypeRef;
  readonly type: CsharpTypeNode;
  readonly expression: CsharpExpression;
  readonly elements: readonly { readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode; readonly conversion: CsharpConversionSelection }[];
  readonly lengthMember: string | undefined;
}

export interface CsharpPlannedArraySpreadInput extends CsharpPlannedValue {
  readonly source: Omit<CsharpArraySpreadInput, "expression">;
}

export function planCsharpArraySpreadInput(
  node: Node,
  expression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementTarget: TargetTypeRef,
  planExpression: ExpressionPlanner,
): CsharpPlannedArraySpreadInput | undefined {
  const carrier = probeCarrierFromResolution(resolveRuntimeCarrierForExpression(input, expression, sourceFile));
  const element = getCsharpCollectionElementTargetType(carrier);
  const carriers = carrier?.kind === "tuple" ? carrier.elements : element === undefined ? undefined : [element];
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  const elements = carriers?.map(selected => ({ carrier: selected,
    type: csharpTypeFromTargetTypeRef(selected, input.scope.typeParameterNames),
    conversion: input.program.conversions.select(selected, elementTarget, "implicit") }));
  if (carrier === undefined || type === undefined || elements === undefined ||
    elements.some(selected => selected.type === undefined || selected.conversion === undefined || !csharpConversionIsApplicable(selected.conversion, "implicit"))) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array spread requires an exact native sequence and sealed destination element conversions."));
    return undefined;
  }
  const planned = planExpression(expression, sourceFile, input, diagnostics);
  if (planned === undefined) return undefined;
  if (planned.completion.kind !== "never" && (planned.completion.kind !== "value" ||
    !targetTypeRefEquals(planned.completion.carrier, carrier))) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array spread requires its exact selected native value completion."));
    return undefined;
  }
  return { ...planned, source: { carrier, type,
    elements: elements.map(selected => ({ carrier: selected.carrier, type: selected.type!, conversion: selected.conversion! })),
    lengthMember: getCsharpIndexableLengthMemberName(carrier) } };
}
