import type { CsharpPlanningContext } from "../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planRegularExpressionLiteral(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = input.program.operations.regularExpression(node);
  if (selection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a regular-expression literal without a sealed operation classification.",
    ));
    return undefined;
  }
  if (selection.kind === "rejected") {
    diagnostics.push({
      code: selection.code,
      category: "error",
      source: "tsonic-csharp",
      message: selection.message,
    });
    return undefined;
  }
  const renderedType = csharpTypeFromTargetTypeRef(selection.targetType);
  if (renderedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a renderable provider constructor result type fact."));
    return undefined;
  }
  return {
    kind: "ObjectCreationExpression",
    type: renderedType,
    arguments: [
      { kind: "Argument", expression: { kind: "LiteralExpression", value: selection.pattern } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: selection.flags } },
    ],
  };
}
