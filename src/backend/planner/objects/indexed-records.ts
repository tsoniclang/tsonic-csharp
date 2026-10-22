import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { Node } from "@tsonic/tsts";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function csharpRecordOperation(name: "GetOrDefault" | "Set" | "Extend", arguments_: readonly CsharpExpression[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "RecordOperations", requiredUsingNamespace: "Tsonic.CSharp.Runtime" }, name },
    arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
}

export function csharpRecordOptionalRead(
  node: Node,
  receiver: CsharpExpression,
  key: CsharpExpression,
  nameHint: string,
  input: CsharpPlanningContext,
): CsharpExpression {
  const selected = input.program.records.indexedRecordRead.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted indexed record read requires its sealed native absence plan.", node);
  if (selected.kind === "direct") return csharpRecordOperation("GetOrDefault", [receiver, key]);
  const type = csharpTypeFromTargetTypeRef(selected.owner, input.scope.typeParameterNames);
  const result = csharpTypeFromTargetTypeRef(selected.result, input.scope.typeParameterNames);
  if (type === undefined || result === undefined) failCsharpPlannerInvariant("An admitted optional record read requires its native receiver and result syntax.", node);
  const name = input.names.temporaryName(nameHint);
  return { kind: "ConditionalExpression", condition: { kind: "IsPatternExpression", expression: receiver, type, designation: name },
    whenTrue: csharpRecordOperation("GetOrDefault", [{ kind: "IdentifierName", name }, key]),
    whenFalse: { kind: "DefaultExpression", type: result } };
}
