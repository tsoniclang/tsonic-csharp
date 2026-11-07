import { selectCsharpNativeIntegerTruncationConversion } from "../../policy/conversions/integer-truncation.js";
import type { Node } from "@tsonic/tsts";

import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpTargetCall } from "../operations/members/selected-members.js";
import { csharpBigIntegerTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";

const truncations = new Map([
  ["Tsonic.CSharp.Js.BigIntOps.asIntN", true],
  ["Tsonic.CSharp.Js.BigIntOps.asUintN", false],
]);

export function selectCsharpIntegerTruncationConversion(
  policy: CsharpPolicyContext,
  expression: Node,
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  if (!policy.ast.is.IsCallExpression(expression) ||
    target.kind !== "source-primitive" || !targetTypeRefEquals(source, csharpBigIntegerTargetType())) return undefined;
  const selection = selectCsharpTargetCall(policy, expression);
  if (selection.kind !== "resolved") return undefined;
  const signed = truncations.get(selection.call.targetMember.id);
  const authored = policy.ast.arguments(selection.source.use);
  const widthArgument = authored[0];
  if (signed === undefined || widthArgument === undefined || authored.length !== 2) return undefined;
  const width = policy.facts.values.literal(widthArgument)?.number;
  return selectCsharpNativeIntegerTruncationConversion(width, signed, target);
}
