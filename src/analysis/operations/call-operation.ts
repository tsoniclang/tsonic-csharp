import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/binary-execution.js";
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

export function analyzeCsharpCallOperation(
  node: Node,
  sourceFile: SourceFile,
  policy: CsharpPolicyContext,
  producer: CsharpOperationProducer,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
  binaryExecutionDrivers: CsharpTargetBinaryExecutionDriver[],
  issues: CsharpOperationIssue[] | undefined,
): void {
  const ast = policy.ast;
  const expression = ast.as.AsCallExpression(node);
  const source = policy.semantics(sourceFile).operations.call(node);
  const callee = source?.sourceCallee.expression ?? expression?.Expression;
  const shape = classifyCsharpJsValueCallShape(policy.ast, source);
  const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueCallOperation(
    policy,
    callee,
    shape.receiver,
    sourceFile,
    shape.kind,
    expression?.QuestionDotToken !== undefined,
  ));
  const typeTest = selectCsharpArrayTypeTest(policy, source, sourceFile);
  const form = selectCsharpCallForm(typeTest, selectCsharpSourceFlowCall(policy, node), jsValue);
  const selectedTarget = jsValue.kind === "not-js-value" && typeTest === undefined
    ? selectCsharpTargetCall(policy, node, sourceFile)
    : undefined;
  const conversionIssue = csharpSelectedCallConversionIssue(policy, selectedTarget);
  if (conversionIssue !== undefined) issues?.push(conversionIssue);
  const target = conversionIssue === undefined ? selectedTarget : undefined;
  if (target?.kind === "resolved") {
    const driver = target.call.targetMember.csharpBinaryExecutionDriver;
    if (driver !== undefined) binaryExecutionDrivers.push(driver);
  }
  const selectedResultType = jsValue.kind === "resolved"
    ? jsValue.resultType
    : policy.types.resolveNode(node, sourceFile)?.sourceResult?.selectedType;
  const selectedOptionalReceiver = classifyCsharpOptionalCallReceiver(policy, source, target, sourceFile);
  const receiverIssue = csharpOperationConversionIssue(node, selectedOptionalReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
  if (receiverIssue !== undefined) issues?.push(receiverIssue);
  const optionalReceiver = receiverIssue === undefined ? selectedOptionalReceiver : undefined;
  const optionalCallee = classifyCsharpOptionalCallCallee(policy, source, sourceFile);
  const sourceCall = source === undefined || target?.kind !== "source-owned" ? undefined
    : classifyCsharpSourceCallee(policy, source, sourceFile);
  const sourceMethodValue = source === undefined || sourceCall?.kind !== "value" ? undefined
    : getCsharpMethodValue(policy.types.resolveNode(source.sourceCallee.expression, sourceFile)?.sourceResult?.selectedType);
  producer.call.selected(node, Object.freeze({
    form,
    ...(sourceMethodValue === undefined ? {} : { sourceMethodValue }),
    ...(optionalReceiver === undefined ? {} : { optionalReceiver }),
    ...(optionalCallee === undefined ? {} : { optionalCallee }),
    unionCall: classifyCsharpUnionCall(policy, source, sourceFile),
    ...(source === undefined ? {} : { source }),
    ...(sourceCall === undefined ? {} : { sourceCall }),
    ...(source === undefined || target?.kind !== "source-owned" && !(target?.kind === "resolved" &&
      target.call.targetMember.kind === "method" && policy.navigation.isProjectDeclaration(
        source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration)) ? {} : {
      sourceResult: policy.types.resolveSourceCallResult(source, sourceFile,
        target?.kind === "resolved" ? target.call.targetMember.returnType : undefined),
    }),
    ...(target === undefined ? {} : { target }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
    ...target?.kind === "resolved"
      ? {
          methodTypeArgumentProjections:
            classifyMethodTypeArgumentProjections(
              policy,
              target.call,
              node,
              sourceFile,
              issues,
            ),
        }
      : {},
    ...(source === undefined
      ? {}
      : {
          sourceTypeArguments:
            policy.types.resolveSourceCallTypeArguments(source, sourceFile),
          ...(typedLocation?.kind === "location-bind" || typedLocation?.kind === "location-project" || typedLocation?.kind === "location-view"
            ? classifyCsharpTypedLocationCallArguments(source, typedLocation)
            : target?.kind === "resolved"
              ? classifyCsharpNativeCallArguments(source, target)
              : classifyCsharpSourceCallArguments(policy, source, sourceFile, sourceCall, sourceMethodValue)),
        }),
  }));
}
