import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  HasSourceKind,
  KindFalseKeyword,
  KindTrueKeyword,
} from "@tsonic/target-api/source";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../types/runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  selectCsharpCompatAnyCondition,
} from "../../../policy/compat/index.js";
import {
  translateCsharpCompatInvocation,
} from "./compat.js";

export function planCsharpConditionExpression(
  expression: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (HasSourceKind(input.ast, expression, KindTrueKeyword) || HasSourceKind(input.ast, expression, KindFalseKeyword)) {
    return planExpression(expression, sourceFile, input, diagnostics);
  }
  const compat = selectCsharpCompatAnyCondition(
    input,
    expression,
    sourceFile,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(expression, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const planned = planExpression(
      expression,
      sourceFile,
      input,
      diagnostics,
    );
    return planned === undefined
      ? undefined
      : translateCsharpCompatInvocation(
          compat,
          undefined,
          [planned],
        );
  }
  const carrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (carrier === undefined) {
    const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the condition expression.");
    diagnostics.push(unsupportedNodeDiagnostic(expression, `${context} requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission. ${detail.reason}`, detail.evidence));
    return undefined;
  }
  if (!isCsharpBoolType(csharpTypeFromTargetTypeRef(carrier))) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, `${context} requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission.`));
    return undefined;
  }
  return planExpression(expression, sourceFile, input, diagnostics);
}

function isCsharpBoolType(type: CsharpTypeNode | undefined): boolean {
  return type?.kind === "PredefinedType" && type.name === "bool";
}
