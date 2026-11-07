import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { CsharpTargetBinaryExecutionDriver, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceCallResult } from "../../target-model/operations/source-call-results.js";
import type { CsharpOperationProducer } from "../program/records/operations/operations.js";
import { classifyCsharpJsValueCallShape } from "./js-value-calls.js";
import { classifyCsharpNativeCallArguments, classifyCsharpSourceCallArguments, classifyCsharpTypedLocationCallArguments } from "./source-call-arguments.js";
import { classifyCsharpUnionCall } from "./union-calls.js";
import { classifyCsharpSourceCallee } from "../callables/calls/source-callees.js";
import { classifyMethodTypeArgumentProjections } from "./method-type-arguments.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "./conversion-admission.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import { selectCsharpArrayTypeTest } from "./source-profiles/js/type-tests.js";
import { selectCsharpCallForm } from "../../policy/operations/members/call-forms.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { classifyCsharpOptionalCallCallee, classifyCsharpOptionalCallReceiver } from "./optional-calls.js";
import { selectCsharpJsValueCallOperation } from "./js-values.js";
import { selectCsharpTargetCall } from "./members/selected-members.js";
import { selectCsharpSourceFlowCall } from "../../policy/operations/flow/source-flow.js";
import { isCsharpRefusal } from "../../representation/index.js";

export function analyzeCsharpCallOperation(
  node: Node,
  policy: CsharpPolicyContext,
  producer: CsharpOperationProducer,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
  binaryExecutionDrivers: CsharpTargetBinaryExecutionDriver[],
  issues: CsharpOperationIssue[] | undefined,
): void {
  const ast = policy.ast;
  const expression = ast.as.AsCallExpression(node);
  // The Host call selection (selections.call); a refused selection never reaches C# analysis.
  const selected = policy.facts.selections.call(node);
  const source = selected === undefined || "code" in selected ? undefined : selected;
  const callee = source?.callee ?? expression?.Expression;
  const shape = classifyCsharpJsValueCallShape(policy.ast, source);
  const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueCallOperation(
    policy,
    callee,
    shape.receiver,
    shape.kind,
    expression?.QuestionDotToken !== undefined,
  ));
  const typeTest = selectCsharpArrayTypeTest(policy, node);
  const form = selectCsharpCallForm(typeTest, selectCsharpSourceFlowCall(policy, node), jsValue);
  const selectedTarget = jsValue.kind === "not-js-value" && typeTest === undefined
    ? selectCsharpTargetCall(policy, node)
    : undefined;
  const conversionIssue = csharpSelectedCallConversionIssue(policy, selectedTarget);
  if (conversionIssue !== undefined) issues?.push(conversionIssue);
  const target = conversionIssue === undefined ? selectedTarget : undefined;
  if (target?.kind === "resolved") {
    const driver = target.call.targetMember.csharpBinaryExecutionDriver;
    if (driver !== undefined) binaryExecutionDrivers.push(driver);
  }
  const callValue = jsValue.kind === "resolved" ? undefined : policy.types.value(node);
  if (callValue !== undefined && isCsharpRefusal(callValue)) issues?.push(Object.freeze({ node, code: callValue.code, message: callValue.message }));
  const selectedResultType = jsValue.kind === "resolved"
    ? jsValue.resultType
    : callValue !== undefined && !isCsharpRefusal(callValue) ? callValue : undefined;
  const selectedOptionalReceiver = classifyCsharpOptionalCallReceiver(policy, source, target);
  const receiverIssue = csharpOperationConversionIssue(node, selectedOptionalReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
  if (receiverIssue !== undefined) issues?.push(receiverIssue);
  const optionalReceiver = receiverIssue === undefined ? selectedOptionalReceiver : undefined;
  const optionalCallee = classifyCsharpOptionalCallCallee(policy, source);
  const sourceCall = source === undefined || target?.kind !== "source-owned" ? undefined
    : classifyCsharpSourceCallee(policy, source);
  const calleeValue = source === undefined || sourceCall?.kind !== "value" ? undefined : policy.types.value(source.callee);
  const sourceMethodValue = calleeValue === undefined || isCsharpRefusal(calleeValue) ? undefined : getCsharpMethodValue(calleeValue);
  // Generic arguments come only from the Host instantiation at this use (G4); a refused argument is reported here.
  const instantiation = source === undefined ? undefined : policy.types.instantiation(node);
  const refusedArgument = instantiation?.method.find(isCsharpRefusal);
  if (refusedArgument !== undefined) issues?.push(Object.freeze({ node, code: refusedArgument.code, message: refusedArgument.message }));
  const sourceTypeArguments = instantiation === undefined || refusedArgument !== undefined ? undefined
    : instantiation.method as readonly TargetTypeRef[];
  const projectMethodCall = target?.kind === "resolved" && target.call.targetMember.kind === "method" &&
    source?.declaration !== undefined && policy.facts.navigation.identity.isProjectDeclaration(source.declaration);
  const sourceResult = source === undefined || target?.kind !== "source-owned" && !projectMethodCall ? undefined
    : sourceCallResult(policy, node, source.result, target?.kind === "resolved" ? target.call.targetMember.returnType : undefined);
  producer.call.selected(node, Object.freeze({
    form,
    ...(sourceMethodValue === undefined ? {} : { sourceMethodValue }),
    ...(optionalReceiver === undefined ? {} : { optionalReceiver }),
    ...(optionalCallee === undefined ? {} : { optionalCallee }),
    unionCall: classifyCsharpUnionCall(policy, source),
    ...(source === undefined ? {} : { source }),
    ...(sourceCall === undefined ? {} : { sourceCall }),
    ...(sourceResult === undefined ? {} : { sourceResult }),
    ...(target === undefined ? {} : { target }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
    ...target?.kind === "resolved"
      ? {
          methodTypeArgumentProjections:
            classifyMethodTypeArgumentProjections(
              policy,
              target.call,
              node,
              issues,
            ),
        }
      : {},
    ...(source === undefined
      ? {}
      : {
          ...(sourceTypeArguments === undefined ? {} : { sourceTypeArguments }),
          ...(typedLocation?.kind === "location-bind" || typedLocation?.kind === "location-project" || typedLocation?.kind === "location-view"
            ? classifyCsharpTypedLocationCallArguments(source, typedLocation)
            : target?.kind === "resolved"
              ? classifyCsharpNativeCallArguments(source, target)
              : classifyCsharpSourceCallArguments(policy, source, sourceCall, sourceMethodValue)),
        }),
  }));
}

/**
 * The source result of a call: the call's published value carrier and its native result carrier (the target member's
 * own return for a provider-bound call, else the instantiated selected signature result). Both are Host descriptors
 * represented once (I6); no checker call result is consulted.
 */
function sourceCallResult(
  policy: CsharpPolicyContext,
  call: Node,
  result: import("@tsonic/target-api/source").SourceTypeDescriptor,
  nativeReturn: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  const selectedType = policy.types.value(call);
  const native = nativeReturn ?? policy.types.represent(result, call, "return");
  if (isCsharpRefusal(selectedType) || isCsharpRefusal(native)) return undefined;
  const outcome = policy.facts.values.type(call);
  return Object.freeze({
    ...(outcome.kind === "refused" ? {} : { effectiveType: outcome }),
    nativeType: native,
    selectedType,
  });
}
