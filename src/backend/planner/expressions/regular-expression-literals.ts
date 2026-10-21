import type { CsharpPlanningContext } from "../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planRegularExpressionLiteral(
  node: Node,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = input.program.records.regularExpression.get(node);
  if (selection === undefined) {
    failCsharpPlannerInvariant("An admitted regular-expression literal requires its sealed operation.", node);
  }
  if (selection.kind === "rejected") {
    failCsharpPlannerInvariant("A rejected regular-expression literal cannot reach planning.", node);
  }
  const renderedType = csharpTypeFromTargetTypeRef(selection.targetType, input.scope.typeParameterNames);
  if (renderedType === undefined) {
    failCsharpPlannerInvariant("An admitted regular expression requires its native constructor type.", node);
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
