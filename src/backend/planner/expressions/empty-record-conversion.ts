import type { CsharpConversionSelection } from "../../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpEmptyRecordConversion(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "empty-record" }>,
  _source: TargetTypeRef | undefined,
  _target: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(selection.target, typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant("An admitted empty-record conversion requires its native type.");
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "AliasQualifiedName", alias: "global", name: {
          kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "ValueTuple",
        } },
        name: "Create" },
      arguments: [
        { kind: "Argument", expression },
        { kind: "Argument", expression: { kind: "ObjectCreationExpression", type, arguments: [] } },
      ],
    },
    name: "Item2",
  };
}
