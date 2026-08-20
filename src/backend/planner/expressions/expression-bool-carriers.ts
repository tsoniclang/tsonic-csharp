import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
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
  selectCsharpJsValueCondition,
} from "../../../policy/js-value-operations/index.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function planCsharpConditionExpression(
  expression: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (HasSourceKind(input.program.source.ast, expression, KindTrueKeyword) || HasSourceKind(input.program.source.ast, expression, KindFalseKeyword)) {
    return planExpression(expression, sourceFile, input, diagnostics);
  }
  const jsValueOperation = selectCsharpJsValueCondition(
    input.policy,
    expression,
    sourceFile,
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(expression, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const planned = planExpression(
      expression,
      sourceFile,
      input,
      diagnostics,
    );
    return planned === undefined
      ? undefined
      : translateCsharpJsValueInvocation(
          jsValueOperation,
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
