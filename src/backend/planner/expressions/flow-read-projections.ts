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
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

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
  if (projection === undefined || projection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      projection?.reason ?? "C# planning received a source value without its sealed storage-read projection.",
    ));
    return undefined;
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
