import { selectCsharpNativeIntegerTruncationConversion } from "../../policy/conversions/integer-truncation.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpTargetCall } from "../operations/members/selected-members.js";
import { csharpBigIntegerTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpNumericLiteralInteger } from "../../policy/conversions/literal-range.js";

const truncations = new Map([
  ["Tsonic.CSharp.Js.BigIntOps.asIntN", true],
  ["Tsonic.CSharp.Js.BigIntOps.asUintN", false],
]);

export function selectCsharpIntegerTruncationConversion(
  policy: CsharpPolicyContext,
  expression: Node,
  sourceFile: SourceFile | undefined,
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  if (sourceFile === undefined || !policy.ast.is.IsCallExpression(expression) ||
    target.kind !== "source-primitive" || !targetTypeRefEquals(source, csharpBigIntegerTargetType())) return undefined;
  const selection = selectCsharpTargetCall(policy, expression, sourceFile);
  if (selection.kind !== "resolved") return undefined;
  const signed = truncations.get(selection.call.targetMember.id);
  const widthArgument = selection.source.arguments[0];
  if (signed === undefined || widthArgument === undefined || selection.source.arguments.length !== 2) return undefined;
  const scalar = policy.facts.descriptors.scalarLiteral(widthArgument.source);
  const width = scalar.kind === "present" ? csharpNumericLiteralInteger(scalar.value) : undefined;
  return width === undefined || width < 0n || width > BigInt(Number.MAX_SAFE_INTEGER) ? undefined
    : selectCsharpNativeIntegerTruncationConversion(Number(width), signed, target);
}
