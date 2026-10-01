import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { CsharpPlanningContext } from "../context.js";

export function csharpRecordOperation(name: "GetOrDefault" | "Set" | "Extend", arguments_: readonly CsharpExpression[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "RecordOperations", requiredUsingNamespace: "Tsonic.CSharp.Runtime" }, name },
    arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
}

export function csharpRecordOptionalRead(
  receiver: CsharpExpression,
  key: CsharpExpression,
  optionalChain: boolean,
  owner: TargetTypeRef | undefined,
  value: TargetTypeRef | undefined,
  nameHint: string,
  input: CsharpPlanningContext,
): CsharpExpression | undefined {
  if (!optionalChain) return csharpRecordOperation("GetOrDefault", [receiver, key]);
  const type = owner === undefined ? undefined
    : csharpTypeFromTargetTypeRef(getCsharpNullableElementTargetType(owner) ?? owner, input.scope.typeParameterNames);
  const result = value === undefined ? undefined
    : csharpTypeFromTargetTypeRef(csharpNullableTargetType(value), input.scope.typeParameterNames);
  if (type === undefined || result === undefined) return undefined;
  const name = input.names.temporaryName(nameHint);
  return { kind: "ConditionalExpression", condition: { kind: "IsPatternExpression", expression: receiver, type, designation: name },
    whenTrue: csharpRecordOperation("GetOrDefault", [{ kind: "IdentifierName", name }, key]),
    whenFalse: { kind: "DefaultExpression", type: result } };
}
