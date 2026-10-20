import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceIntegerTruncationFits } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../model/context.js";
import { selectCsharpTargetCall } from "../../analysis/operations/provider/selected-members.js";
import {
  csharpBigIntegerTargetType,
  targetTypeRefEquals,
} from "../../target-model/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";

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
  const widthArgument = selection.source.sourceArguments[0]?.expression;
  if (signed === undefined || widthArgument === undefined || selection.source.sourceArguments.length !== 2) return undefined;
  const width = policy.literalValues.literalValue.get(widthArgument)?.number;
  return width !== undefined && sourceIntegerTruncationFits(width, signed, target.name)
    ? { kind: "integer-truncation", signed, width }
    : undefined;
}
