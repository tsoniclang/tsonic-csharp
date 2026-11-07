import { csharpHostUnionUse } from "../../policy/conversions/union-relations.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { SourceCallSelection } from "@tsonic/target-api/source";
import { isCsharpRefusal, type CsharpRefusal } from "../../representation/index.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { getCsharpDelegateSignature, getCsharpNullableElementTargetType } from "../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpCallClassification } from "../../target-model/records/operations/operations.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";

export function classifyCsharpOptionalCallCallee(
  policy: CsharpPolicyContext, source: SourceCallSelection | undefined, issues: CsharpOperationIssue[] | undefined,
): CsharpCallClassification["optionalCallee"] {
  if (source === undefined || policy.ast.as.AsCallExpression(source.use)?.QuestionDotToken === undefined) return undefined;
  // A refused callee storage carrier is reported here, with its own code and site (never dropped, D1 §1.4).
  const selected = policy.types.readStorage(source.callee);
  if (isCsharpRefusal(selected)) return reportStorageRefusal(selected, issues);
  const type = getCsharpNullableElementTargetType(selected) ?? getCsharpGenericOptionalParts(selected)?.element ?? selected;
  return getCsharpDelegateSignature(type) === undefined && getCsharpMethodValue(type) === undefined && !isCsharpJsValueTargetType(type)
    ? undefined : Object.freeze({ expression: source.callee, storage: selected, type, guard: true });
}

export function classifyCsharpOptionalCallReceiver(
  policy: CsharpPolicyContext,
  source: SourceCallSelection | undefined,
  target: CsharpTargetCallSelection | undefined,
  issues: CsharpOperationIssue[] | undefined,
): CsharpCallClassification["optionalReceiver"] {
  if (source?.optionalChain !== true || source.receiver === undefined ||
    policy.ast.as.AsCallExpression(source.use)?.QuestionDotToken !== undefined) {
    return undefined;
  }
  const receiver = source.receiver;
  const selected = policy.types.readStorage(receiver);
  if (isCsharpRefusal(selected)) return reportStorageRefusal(selected, issues);
  const type = getCsharpNullableElementTargetType(selected) ?? getCsharpGenericOptionalParts(selected)?.element ?? selected;
  const access = source.callee;
  const guard = (
    policy.ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !== undefined ||
    policy.ast.as.AsElementAccessExpression(access)?.QuestionDotToken !== undefined
  );
  const parameter = target?.kind === "resolved" && target.call.receiver.kind === "target-parameter"
    ? target.call.targetMember.parameters[target.call.receiver.targetParameterIndex]
    : undefined;
  return Object.freeze({
    expression: receiver,
    storage: selected,
    type,
    guard,
    ...(parameter === undefined ? {} : {
      parameterType: parameter.type,
      conversion: admitCsharpConversionSelection(policy, type, parameter.type,
        selectCsharpConversion(policy, type, parameter.type, "implicit", csharpHostUnionUse(policy.facts, receiver))),
    }),
  });
}

function reportStorageRefusal(refusal: CsharpRefusal, issues: CsharpOperationIssue[] | undefined): undefined {
  issues?.push(Object.freeze({ node: refusal.site, code: refusal.code, message: refusal.message }));
  return undefined;
}
