import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceMemberUse } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpCallClassification, CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpJsValueOperationSelection } from "../../target-model/operations/js-values.js";
import type { CsharpOperationProducer } from "../program/records/operations/operations.js";
import { classifyCsharpJsValueCallShape } from "./js-value-calls.js";
import { classifyCsharpNativeCallArguments, classifyCsharpSourceCallArguments, classifyCsharpTypedLocationCallArguments } from "./source-call-arguments.js";
import { classifyCsharpUnionCall } from "./union-calls.js";
import { classifyCsharpSourceCallee } from "../callables/calls/source-callees.js";
import { selectCsharpSourceCallableApplication } from "../callables/calls/native-application.js";
import { classifyMethodTypeArgumentProjections } from "./method-type-arguments.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "./conversion-admission.js";
import { selectCsharpNativeJsValueCallOperation, validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import { selectCsharpArrayTypeTest } from "./source-profiles/js/type-tests.js";
import { selectCsharpCallForm } from "../../policy/operations/members/call-forms.js";
import { classifyCsharpOptionalCallCallee, classifyCsharpOptionalCallReceiver } from "./optional-calls.js";
import { selectCsharpTargetCall } from "./members/selected-members.js";
import { selectCsharpSourceFlowCall } from "../../policy/operations/flow/source-flow.js";
import { csharpSelectedCallResultType } from "../../target-model/types/member-facts.js";
import { optionalResultType } from "../../policy/operations/members/optional-results.js";
import { csharpVoidTargetType, csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { csharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";

export function analyzeCsharpCallOperation(
  node: Node,
  sourceFile: SourceFile,
  policy: CsharpPolicyContext,
  producer: CsharpOperationProducer,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
  binaryExecutionDrivers: CsharpTargetBinaryExecutionDriver[],
  issues: CsharpOperationIssue[] | undefined,
): void {
  const noUnion = Object.freeze({ kind: "not-union" as const });
  const publication = policy.facts.applications.application(node);
  const failed = (outcome: Exclude<CsharpRepresentationOutcome<unknown>, { readonly kind: "represented" }>): void => {
    const diagnostic = csharpRepresentationDiagnostic(outcome);
    issues?.push(Object.freeze({ node: diagnostic.sourceNode ?? node, code: diagnostic.code,
      message: diagnostic.message, source: diagnostic.source }));
  };
  if (publication.kind === "refused") {
    const outcome = Object.freeze({ kind: "source-refused" as const, refusal: publication });
    failed(outcome);
    producer.call.selected(node, Object.freeze({ form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }),
      target: outcome, unionCall: noUnion }));
    return;
  }
  const source = publication.value;
  if (source.argumentDisposition === "skip") {
    producer.call.selected(node, Object.freeze({
      source, skippedInvocation: true, form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }),
      target: Object.freeze({ kind: "source-owned", source, reason: "The published Source invocation skips its arguments and call." }),
      unionCall: noUnion, selectedResultType: csharpAbsenceTargetType(),
    }));
    return;
  }
  const arrayTest = selectCsharpArrayTypeTest(policy, source);
  if (arrayTest.kind !== "represented") {
    failed(arrayTest);
    producer.call.selected(node, Object.freeze({ source, target: arrayTest, unionCall: noUnion,
      form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }) }));
    return;
  }
  const typeTest = arrayTest.value.kind === "present" ? arrayTest.value.value : undefined;
  const flow = selectCsharpSourceFlowCall(policy, node);
  const selectedTarget = typeTest === undefined && flow.kind === "not-source-flow"
    ? selectCsharpTargetCall(policy, node, sourceFile) : undefined;
  if (selectedTarget?.kind === "source-refused" || selectedTarget?.kind === "native-refused") failed(selectedTarget);
  const conversionIssue = csharpSelectedCallConversionIssue(policy, selectedTarget);
  if (conversionIssue !== undefined) issues?.push(conversionIssue);
  const target = conversionIssue === undefined ? selectedTarget : undefined;
  let member: SourceMemberUse | undefined;
  let jsValue: CsharpJsValueOperationSelection = Object.freeze({ kind: "not-js-value" });
  if (target?.kind === "source-owned") {
    const callee = policy.nativeValue(source.callee.occurrence);
    if (callee.kind !== "represented") {
      failed(callee);
      producer.call.selected(node, Object.freeze({ source, target: callee, unionCall: noUnion,
        form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }) }));
      return;
    }
    let receiver: TargetTypeRef | undefined;
    if (source.receiver.kind === "value") {
      const use = policy.facts.objects.use(source.callee.occurrence);
      if (use.kind === "refused") {
        const outcome = Object.freeze({ kind: "source-refused" as const, refusal: use });
        failed(outcome);
        producer.call.selected(node, Object.freeze({ source, target: outcome, unionCall: noUnion,
          form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }) }));
        return;
      }
      member = use.value;
      const physical = policy.nativeValue(source.receiver.occurrence);
      if (physical.kind !== "represented") {
        failed(physical);
        producer.call.selected(node, Object.freeze({ source, target: physical, unionCall: noUnion,
          form: Object.freeze({ kind: "target", optionalReceiverRouting: "chain" }) }));
        return;
      }
      receiver = physical.value;
    }
    const shape = classifyCsharpJsValueCallShape(source, member);
    jsValue = validateCsharpJsValueOperationSelection(selectCsharpNativeJsValueCallOperation(
      callee.value, receiver, shape.kind, source.optionalCall));
  }
  const form = selectCsharpCallForm(typeTest, flow, jsValue);
  if (target?.kind === "resolved") {
    const driver = target.call.targetMember.csharpBinaryExecutionDriver;
    if (driver !== undefined) binaryExecutionDrivers.push(driver);
  }
  const optionalReceiver = classifyCsharpOptionalCallReceiver(policy, source, target);
  const optionalCallee = classifyCsharpOptionalCallCallee(policy, source);
  if (optionalReceiver.kind !== "represented") failed(optionalReceiver);
  if (optionalCallee.kind !== "represented") failed(optionalCallee);
  const receiverValue = optionalReceiver.kind === "represented" && optionalReceiver.value.kind === "present"
    ? optionalReceiver.value.value : undefined;
  const calleeValue = optionalCallee.kind === "represented" && optionalCallee.value.kind === "present"
    ? optionalCallee.value.value : undefined;
  const receiverIssue = csharpOperationConversionIssue(node, receiverValue?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
  if (receiverIssue !== undefined) issues?.push(receiverIssue);
  const unionCall = target?.kind === "source-owned" && jsValue.kind === "not-js-value"
    ? classifyCsharpUnionCall(policy, source, sourceFile) : noUnion;
  let sourceArguments: CsharpCallClassification = { source, form, unionCall,
    ...(target === undefined ? {} : { target }),
    ...(receiverValue === undefined || receiverIssue !== undefined ? {} : { optionalReceiver: receiverValue }),
    ...(calleeValue === undefined ? {} : { optionalCallee: calleeValue }),
  };
  if (target?.kind === "source-owned" && jsValue.kind === "not-js-value" && unionCall.kind === "not-union") {
    const application = selectCsharpSourceCallableApplication(policy, source);
    if (application.kind !== "represented") failed(application);
    else {
      const callee = classifyCsharpSourceCallee(policy, source, application.value);
      if (callee.kind !== "represented") failed(callee);
      sourceArguments = { ...sourceArguments, ...classifyCsharpSourceCallArguments(source, application.value),
        sourceTypeArguments: application.value.typeArguments,
        ...(callee.kind !== "represented" ? {} : { sourceCall: callee.value }),
        sourceResult: Object.freeze({ nativeType: application.value.applied.signature.returnType,
          selectedType: application.value.applied.signature.returnType }),
      };
    }
  } else if (typedLocation?.kind === "location-bind" || typedLocation?.kind === "location-project" || typedLocation?.kind === "location-view") {
    sourceArguments = { ...sourceArguments, ...classifyCsharpTypedLocationCallArguments(source, typedLocation) };
  } else if (target?.kind === "resolved") {
    sourceArguments = { ...sourceArguments, ...classifyCsharpNativeCallArguments(source, target),
      methodTypeArgumentProjections: classifyMethodTypeArgumentProjections(policy, target.call, node, sourceFile, issues) };
  }
  const physical = target?.kind === "resolved"
    ? csharpSelectedCallResultType(target.call.targetMember, target.call.discardResult === true)
    : sourceArguments.callableApplication?.applied.signature.returnType;
  if (target?.kind === "resolved" && physical === undefined) issues?.push(Object.freeze({ node,
    code: "CSHARP_CALL_RESULT_ABI_NOT_PROVEN", message: "The selected Native member has no exact physical completion carrier." }));
  const selectedResultType = jsValue.kind === "resolved" ? jsValue.resultType
    : form.kind === "type-test" ? csharpSourcePrimitiveTargetType("bool")
    : form.kind === "keep-alive" ? csharpVoidTargetType()
    : unionCall.kind === "resolved" ? unionCall.resultType
    : physical === undefined ? undefined : optionalResultType(physical, source.argumentDisposition === "dynamic");
  producer.call.selected(node, Object.freeze({ ...sourceArguments,
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
  }));
}
