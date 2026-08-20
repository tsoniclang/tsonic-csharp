import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  selectCsharpRegularExpressionLiteral,
} from "../../../policy/operations/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planRegularExpressionLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = selectCsharpRegularExpressionLiteral(
    input.policy,
    node,
    sourceFile,
  );
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
