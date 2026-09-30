import type { SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetCallSelection, ResolvedSourceCallInfo } from "../../policy/operations/members/index.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { getCsharpDelegateSignature, getCsharpNullableElementTargetType } from "../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpCallClassification } from "./model.js";

export function classifyCsharpOptionalCallCallee(
  policy: CsharpPolicyContext, source: ResolvedSourceCallInfo | undefined, sourceFile: SourceFile,
): CsharpCallClassification["optionalCallee"] {
  if (source === undefined || policy.ast.as.AsCallExpression(source.call)?.QuestionDotToken === undefined) return undefined;
  const selected = policy.types.resolveNode(source.sourceCallee.expression, sourceFile);
  if (selected === undefined) return undefined;
  const type = getCsharpNullableElementTargetType(selected) ?? selected;
  return getCsharpDelegateSignature(type) === undefined && getCsharpMethodValue(type) === undefined ? undefined : type;
}

export function classifyCsharpOptionalCallReceiver(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo | undefined,
  target: CsharpTargetCallSelection | undefined,
  sourceFile: SourceFile,
): CsharpCallClassification["optionalReceiver"] {
  if (source?.optionalChain !== true || source.sourceReceiver === undefined ||
    policy.ast.as.AsCallExpression(source.call)?.QuestionDotToken !== undefined) {
    return undefined;
  }
  const receiver = source.sourceReceiver;
  const selected = policy.types.resolveSelectedValue(receiver.expression, receiver.type, sourceFile);
  if (selected === undefined) return undefined;
  const type = getCsharpNullableElementTargetType(selected) ?? selected;
  const access = source.sourceCalleeAccess?.expression;
  const guard = access !== undefined && (
    policy.ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !== undefined ||
    policy.ast.as.AsElementAccessExpression(access)?.QuestionDotToken !== undefined
  );
  const parameter = target?.kind === "resolved" && target.call.receiver.kind === "target-parameter"
    ? target.call.targetMember.parameters[target.call.receiver.targetParameterIndex]
    : undefined;
  return Object.freeze({
    expression: receiver.expression,
    type,
    guard,
    ...(parameter === undefined ? {} : {
      parameterType: parameter.type,
      conversion: selectCsharpConversion(policy, type, parameter.type, "implicit"),
    }),
  });
}
