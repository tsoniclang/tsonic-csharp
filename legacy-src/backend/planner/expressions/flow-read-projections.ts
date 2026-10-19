import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";

export function planFlowReadUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (input.storageExpression === node) return baseExpression;
  const projection = input.program.records.flowReadProjection.get(node);
  if (projection?.kind === "identity") return baseExpression;
  if (projection?.kind === "non-null") {
    return { kind: "PostfixUnaryExpression", operand: baseExpression, operatorToken: { kind: "ExclamationToken" } };
  }
  if (projection?.kind !== "conversion" || projection.source === undefined || projection.target === undefined ||
    projection.selection === undefined || projection.selection.kind === "rejected" || projection.selection.kind === "ambiguous") {
    return failCsharpPlannerInvariant(
      "C# planning received a source value without a valid sealed storage-read projection.",
      node,
    );
  }
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    projection.source,
    projection.target,
    projection.selection,
    baseExpression,
  );
}
