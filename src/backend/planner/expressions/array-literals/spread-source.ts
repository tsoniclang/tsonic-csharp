import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  TargetTypeRef,
} from "../../../../policy/types/index.js";
import {
  getCsharpCollectionElementTargetType,
  targetTypeRefEquals,
} from "../../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../roslyn/syntax.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  sameCsharpType,
} from "../../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../../types/runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  planTupleSpreadArrayExpression,
} from "./tuple-spread.js";

export function planArraySpreadSourceExpression(
  spreadNode: Node,
  expression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedElementType: CsharpTypeNode,
  expectedElementTargetType: TargetTypeRef | undefined,
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const carrierResolution = resolveRuntimeCarrierForExpression(
    input,
    expression,
    sourceFile,
  );
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (carrier?.kind === "tuple") {
    return planTupleSpreadArrayExpression(
      spreadNode,
      expression,
      sourceFile,
      input,
      diagnostics,
      carrier,
      expectedElementType,
      expectedElementTargetType,
      planExpression,
    );
  }
  const actualElementTargetType = getCsharpCollectionElementTargetType(carrier);
  if (
    actualElementTargetType === undefined ||
    !spreadElementMatches(
      actualElementTargetType,
      expectedElementTargetType,
      expectedElementType,
    )
  ) {
    const detail = carrier === undefined
      ? missingCarrierDiagnosticDetail(
          carrierResolution,
          "Runtime carrier fact is missing for the array spread expression.",
        )
      : {
          reason: "Finalized spread carrier does not prove an enumerable sequence with the exact target element type.",
          evidence: [],
        };
    diagnostics.push(unsupportedNodeDiagnostic(
      spreadNode,
      `Array spread requires a finalized sequence carrier with the exact target element type before C# emission. ${detail.reason}`,
      detail.evidence,
    ));
    return undefined;
  }
  return planExpression(expression, sourceFile, input, diagnostics);
}

function spreadElementMatches(
  actual: TargetTypeRef,
  expected: TargetTypeRef | undefined,
  expectedType: CsharpTypeNode,
): boolean {
  if (expected !== undefined) {
    return targetTypeRefEquals(actual, expected);
  }
  const actualType = csharpTypeFromTargetTypeRef(actual);
  return actualType !== undefined && sameCsharpType(actualType, expectedType);
}
