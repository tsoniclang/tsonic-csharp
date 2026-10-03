import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpCollectionElementRead } from "../../../target-model/types/collection-reads.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function planCsharpCollectionElementRead(
  carrier: TargetTypeRef, receiver: CsharpExpression, index: CsharpExpression,
  typeParameterNames?: ReadonlyMap<string, string>,
): CsharpExpression | undefined {
  const selection = selectCsharpCollectionElementRead(carrier);
  if (selection === undefined || selection.kind === "invalid") return undefined;
  if (selection.kind === "indexer") return { kind: "ElementAccessExpression", receiver, arguments: [index] };
  const owner = csharpTypeFromTargetTypeRef(selection.member.declaringType!, typeParameterNames);
  return owner === undefined ? undefined : { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selection.member.targetName },
    arguments: [{ kind: "Argument", expression: receiver,
      ...(selection.member.parameters[0]!.passingMode === "byref-readonly" ? { passing: "in" as const } : {}) },
      { kind: "Argument", expression: index }] };
}
