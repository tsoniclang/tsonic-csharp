import type { CsharpConversionSelection } from "../../../analysis/conversions/index.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../../target-model/types/index.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function planCsharpEmptyRecordConversion(
  selection: Extract<CsharpConversionSelection, { readonly kind: "empty-record" }>,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  if (source === undefined || target === undefined || !targetTypeRefEquals(source, selection.source) ||
    !targetTypeRefEquals(target, selection.target)) return undefined;
  const type = csharpTypeFromTargetTypeRef(target);
  return type === undefined ? undefined : {
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
