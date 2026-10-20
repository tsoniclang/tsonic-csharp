import { classifyCsharpJsValueCallShape } from "./js-value-calls.js";
import { classifyCsharpSourceCallArguments } from "./source-call-arguments.js";
import { classifyCsharpUnionCall } from "./union-calls.js";
import { classifyCsharpSourceCallee } from "../callables/source-callees.js";
import { classifyCsharpBorrowedSequenceInput } from "./borrowed-sequences.js";

import { classifyTypeofComparison } from "./typeof-comparisons.js";
import { classifyMethodTypeArgumentProjections } from "./method-type-arguments.js";
import { csharpErasedExpressionStatement, type CsharpOperationErasure } from "./statement-erasure.js";
import type { CsharpAwaitCompletion } from "../../target-model/types/await-completions.js";
import { selectCsharpAwaitCompletion } from "../../policy/operations/control-flow/await-completions.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "./conversion-admission.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import { resolveCsharpInstanceType } from "../types/resolution/instance-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";
import { selectCsharpOperatorForm } from "../../policy/operations/operators/operator-forms.js";
import { selectCsharpArrayTypeTest } from "../../policy/operations/source-profiles/js/type-tests.js";
import { selectCsharpCallForm } from "../../policy/operations/members/selection/call-forms.js";
import { getCsharpTypeofResult } from "../../target-model/types/runtime-kind.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import { classifyCsharpOptionalCallCallee, classifyCsharpOptionalCallReceiver } from "./optional-calls.js";
import { selectCsharpMemoryBinding } from "./memory-bindings.js";

import { selectCsharpElementDeletion } from "./collections/element-deletion.js";
import { selectCsharpSwitch } from "./control-flow/switch.js";
import { AsForInOrOfStatement, sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import { selectCsharpJsValueCallOperation, selectCsharpJsValueBinaryOperation, selectCsharpJsValueReceiverExpressionOperation, selectCsharpJsValueUnaryOperation, selectCsharpJsTypeofOperation, selectCsharpJsValueCondition, selectCsharpJsValueVoidOperation, selectCsharpJsObjectLiteralOperation } from "../../policy/operations/js-values/index.js";
import { selectCsharpProviderValue, selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../../policy/operations/members/index.js";
import { selectCsharpNativePointerOperation, sourceOperatorFromKindName, selectCsharpJsArrayMutation, selectCsharpJsStringConversion } from "../../policy/operations/index.js";
import { selectCsharpNativeRefReturn, selectCsharpTypedLocationOperation } from "./typed-locations.js";
import { selectCsharpRegularExpressionLiteral } from "./syntax/regexp-literal.js";
import { selectCsharpResourceManagement } from "../control-flow/resource-management.js";
import { selectCsharpSourceFlowCall } from "../../policy/operations/flow/source-flow.js";
import { selectCsharpBinaryOperation, selectCsharpDestructuringAssignmentOperation, selectCsharpUnaryOperation } from "./operators.js";
import { selectCsharpIteration } from "./iteration/selection.js";
import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations.js";

import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { classifyExactUnmodifiedCatchRethrow } from "./catch-rethrow.js";
import { selectCsharpThrownOperandCarrier } from "../../policy/conversions/program-error.js";
import { classifySourceOwnedMember, classifySourceOwnedElementMember, classifyCsharpMemberReceiver, elementSelectedTypes } from "./member-access.js";

import type { CsharpOperationProducer } from "../program/records/operations.js";

export function analyzeCsharpOperationConstruct(
  node: Node,
  sourceFile: SourceFile,
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  erasure: CsharpOperationErasure,
  producer: CsharpOperationProducer,
  binaryExecutionDrivers:
    import("../../target-model/metadata/provider-metadata.js").CsharpTargetBinaryExecutionDriver[],
  scopeIssues: CsharpOperationIssue[] | undefined,
): void {
  if (evidence.compileTimeMetadata.get(node)) return;
  if (policy.types.nativeUnreachable(node)) {
    producer.nativeUnreachable.selected(node, true);
    return;
  }
  const { ast } = policy;
  if (sourceClassFieldIsTypeOnly(ast, node)) return;
  const issues = erasure.demandedInvocations.has(node) ? erasure.issues : scopeIssues;
  const erased = ast.is.IsExpressionStatement(node) && csharpErasedExpressionStatement(ast, node, erasure);
  if (erased) producer.erasedStatement.selected(node, true);
  if (ast.is.IsAwaitExpression(node)) {
    const expression = ast.as.AsAwaitExpression(node)?.Expression;
    const completion = selectCsharpAwaitCompletion(
      expression === undefined ? undefined : policy.types.resolveNode(expression, sourceFile),
      policy.typeDefinitions);
    const rejection = awaitResultMappingRejection(policy, completion);
    if (rejection !== undefined) {
      issues?.push(Object.freeze({ node, code: "CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN", message: rejection }));
    }
    producer.await.selected(node, rejection === undefined ? completion : undefined);
  }
  if (ast.is.IsSpreadElement(node)) {
    const expression = ast.as.AsSpreadElement(node)?.Expression;
    if (expression !== undefined) {
      producer.borrowedSequence.selected(expression, classifyCsharpBorrowedSequenceInput(policy, expression, sourceFile));
    }
  }
  if (ast.is.IsIfStatement(node)) {
    const expression = ast.as.AsIfStatement(node)?.Expression;
    const result = expression === undefined ? undefined : policy.types.nativeGuardResult(expression);
    if (expression !== undefined && result !== undefined) producer.nativeGuardResult.selected(expression, result);
  }
  if (ast.is.IsSwitchStatement(node)) {
    producer.switch.selected(node, selectCsharpSwitch(policy, node, sourceFile));
  }
  producer.jsCondition.selected(node, selectCsharpJsValueCondition(policy, node, sourceFile),
  );
  producer.jsTypeof.selected(node, selectCsharpJsTypeofOperation(policy, node, sourceFile),
  );
  if (ast.is.IsTypeOfExpression(node)) {
    const operand = ast.as.AsTypeOfExpression(node)?.Expression;
    const selected = operand === undefined ? undefined : getCsharpTypeofResult(policy.types.resolveNode(operand, sourceFile), undefined, policy.typeDefinitions);
    if (operand !== undefined && selected !== undefined) producer.typeofRuntimeKind.selected(operand, selected);
  }
  if (ast.is.IsIdentifier(node)) {
    producer.providerValue.selected(node, selectCsharpProviderValue(policy, node),
    );
  }
  if (
    ast.is.IsCallExpression(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node)
  ) {
    producer.nativeRefReturn.selected(node, selectCsharpNativeRefReturn(policy, node, sourceFile),
    );
  }
  if (ast.is.IsRegularExpressionLiteral(node)) {
    const selection = selectCsharpRegularExpressionLiteral(policy, node, sourceFile);
    if (selection.kind === "rejected") issues?.push(Object.freeze({ node, code: selection.code, message: selection.message }));
    producer.regularExpression.selected(node, selection,
    );
  }
  if (ast.is.IsCallExpression(node)) {
    const memoryBinding = selectCsharpMemoryBinding(policy, node, sourceFile);
    if (memoryBinding?.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message: memoryBinding.reason }));
    producer.memoryBinding.selected(node, memoryBinding);
    const stringConversion = selectCsharpJsStringConversion(policy, node, sourceFile);
    if (stringConversion.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_JS_STRING_CONVERSION_REJECTED", message: stringConversion.reason }));
    producer.jsStringConversion.selected(node, stringConversion);
  }
  if (ast.is.IsDeleteExpression(node)) {
    const selection = selectCsharpElementDeletion(policy, node, sourceFile);
    if (selection.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message: selection.reason }));
    producer.elementDeletion.selected(node, selection);
  }
  if (ast.is.IsBinaryExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    const arrayMutation = selectCsharpJsArrayMutation(policy, node, sourceFile);
    if (arrayMutation.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message: arrayMutation.reason }));
    producer.jsArrayMutation.selected(node, arrayMutation);
  }
  if (ast.is.IsVoidExpression(node)) {
    const operand = ast.as.AsVoidExpression(node)?.Expression;
    producer.jsVoid.selected(node, selectCsharpJsValueVoidOperation(policy, operand, sourceFile),
    );
  }
  if (ast.is.IsObjectLiteralExpression(node)) {
    producer.jsObjectLiteral.selected(node, selectCsharpJsObjectLiteralOperation(),
    );
  }
  const operationNode =
    ast.is.IsCallExpression(node) ||
    ast.is.IsNewExpression(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node) ||
    ast.is.IsBinaryExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) ||
    ast.is.IsPostfixUnaryExpression(node);
  if (operationNode) {
    const nativePointer = selectCsharpNativePointerOperation(policy, node, sourceFile);
    if (nativePointer.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      message: `C# native-pointer '${nativePointer.operation}' is not mapped: ${nativePointer.reason}` }));
    producer.nativePointer.selected(node, nativePointer,
    );
    producer.typedLocation.selected(node, selectCsharpTypedLocationOperation(policy, node, sourceFile),
    );
  }
  if (ast.is.IsCallExpression(node)) {
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
      : policy.types.resolveNode(node, sourceFile);
    const selectedOptionalReceiver = classifyCsharpOptionalCallReceiver(policy, source, target, sourceFile);
    const receiverIssue = csharpOperationConversionIssue(node, selectedOptionalReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
    if (receiverIssue !== undefined) issues?.push(receiverIssue);
    const optionalReceiver = receiverIssue === undefined ? selectedOptionalReceiver : undefined;
    const optionalCallee = classifyCsharpOptionalCallCallee(policy, source, sourceFile);
    const sourceCall = source === undefined || target?.kind !== "source-owned" ? undefined
      : classifyCsharpSourceCallee(policy, source, sourceFile);
    const sourceMethodValue = source === undefined || sourceCall?.kind !== "value" ? undefined
      : getCsharpMethodValue(policy.types.resolveNode(source.sourceCallee.expression, sourceFile));
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
            ...classifyCsharpSourceCallArguments(policy, source, sourceFile, sourceCall, sourceMethodValue),
          }),
    }));
  } else if (ast.is.IsNewExpression(node)) {
    const expression = ast.as.AsNewExpression(node);
    const jsValue = selectCsharpJsValueReceiverExpressionOperation(
      policy,
      expression?.Expression,
      sourceFile,
      "construct",
    );
    const selectedTarget = jsValue.kind === "not-js-value"
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
      : policy.types.resolveNode(node, sourceFile);
    producer.construction.selected(node, Object.freeze({
      jsValue,
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
      ...target?.kind === "source-owned"
        ? {
            ...classifyCsharpSourceCallArguments(policy, target.source, sourceFile),
          }
        : {},
    }));
  } else if (ast.is.IsPropertyAccessExpression(node)) {
    const selection = selectCsharpTargetProperty(policy, node, sourceFile);
    const selectedReceiver = selection.kind === "resolved" || selection.kind === "source-owned"
      ? classifyCsharpMemberReceiver(policy, selection.source, sourceFile) : undefined;
    const receiverIssue = csharpOperationConversionIssue(node, selectedReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
    if (receiverIssue !== undefined) issues?.push(receiverIssue);
    const receiverProjection = receiverIssue === undefined ? selectedReceiver : undefined;
    producer.property.selected(node, Object.freeze({
        selection,
        ...(receiverProjection === undefined ? {} : { receiverProjection }),
        ...(selection.kind === "source-owned"
          ? {
              sourceOwned: classifySourceOwnedMember(
                policy,
                selection,
                sourceFile,
              ),
            }
          : {}),
      }),
    );
  } else if (ast.is.IsElementAccessExpression(node)) {
    const expression = ast.as.AsElementAccessExpression(node);
    const source = policy.semantics(sourceFile).operations.elementAccess(node);
    const selectedReceiver = source === undefined ? undefined : classifyCsharpMemberReceiver(policy, source, sourceFile);
    const receiverIssue = csharpOperationConversionIssue(node, selectedReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
    if (receiverIssue !== undefined) issues?.push(receiverIssue);
    const receiverProjection = receiverIssue === undefined ? selectedReceiver : undefined;
    const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverExpressionOperation(
      policy,
      expression?.Expression,
      sourceFile,
      "element-read",
      expression?.QuestionDotToken !== undefined,
    ));
    const target = jsValue.kind === "not-js-value" ? selectCsharpTargetElement(policy, node, sourceFile) : undefined;
    const sourceOwned = classifySourceOwnedElementMember(policy, target, sourceFile);
    const selectedTypes = source === undefined ? {} : elementSelectedTypes(policy, source, sourceFile, target);
    const elementIssue = csharpOperationConversionIssue(node, selectedTypes.flowReadConversion, "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN");
    if (elementIssue !== undefined) issues?.push(elementIssue);
    producer.element.selected(node, Object.freeze({
      jsValue,
      ...(receiverProjection === undefined ? {} : { receiverProjection }),
      ...selectedTypes,
      ...(elementIssue === undefined ? {} : { flowReadConversion: undefined }),
      ...(target === undefined ? {} : { target }),
      ...(sourceOwned === undefined ? {} : { sourceOwned }),
    }));
  } else if (ast.is.IsBinaryExpression(node)) {
    const expression = ast.as.AsBinaryExpression(node);
    const sourceOperator = sourceOperatorFromKindName(
      ast.operatorKindName(node),
    ) ?? "";
    const propertyWrite = expression?.Left !== undefined &&
        ast.is.IsPropertyAccessExpression(expression.Left)
      ? selectCsharpJsValueReceiverExpressionOperation(
          policy,
          ast.as.AsPropertyAccessExpression(expression.Left)?.Expression,
          sourceFile,
          "property-write",
          ast.as.AsPropertyAccessExpression(expression.Left)
              ?.QuestionDotToken !== undefined,
        )
      : undefined;
    const elementWrite = expression?.Left !== undefined &&
        ast.is.IsElementAccessExpression(expression.Left)
      ? selectCsharpJsValueReceiverExpressionOperation(
          policy,
          ast.as.AsElementAccessExpression(expression.Left)?.Expression,
          sourceFile,
          "element-write",
          ast.as.AsElementAccessExpression(expression.Left)
              ?.QuestionDotToken !== undefined,
        )
      : undefined;
    const typeofComparison = classifyTypeofComparison(policy, node, sourceFile);
    const instanceType = sourceOperator === "instanceof" && expression?.Right !== undefined
      ? resolveCsharpInstanceType(policy.semantics(sourceFile), expression.Right,
        type => policy.types.resolveType(type, sourceFile)) : undefined;
    const instanceFactory = sourceOperator === "instanceof" && expression?.Right !== undefined
      ? evidence.nodeTargetType.get(expression.Right) : undefined;
    const instanceSource = sourceOperator === "instanceof" && expression?.Left !== undefined
      ? evidence.nodeTargetType.get(expression.Left) : undefined;
    const instancePredicate = instanceType === undefined ? undefined : Object.freeze({ kind: "nominal" as const, targetCarrier: instanceType });
    const instancePlan = instanceSource === undefined || instancePredicate === undefined ? undefined
      : selectCsharpClosedTypeTestPlan(instanceSource, instancePredicate, undefined, policy.typeDefinitions);
    const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(
      policy, expression?.Left, expression?.Right, sourceFile, sourceOperator));
    if (jsValue.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message: jsValue.reason }));
    producer.binary.selected(node, Object.freeze({
        jsValue,
        target: selectCsharpBinaryOperation(
          policy,
          node,
          evidence.nodeTargetType.get,
        ),
        destructuring: selectCsharpDestructuringAssignmentOperation(
          policy,
          node,
          sourceFile,
        ),
        ...(propertyWrite === undefined ? {} : { propertyWrite }),
        ...(elementWrite === undefined ? {} : { elementWrite }),
        ...(typeofComparison === undefined ? {} : { typeofComparison }),
        ...(instancePlan === undefined || instanceSource === undefined || instancePredicate === undefined ? {}
          : { instanceTest: Object.freeze({ sourceCarrier: instanceSource, predicate: instancePredicate, test: instancePlan }) }),
        ...(getCsharpClassFactory(instanceFactory) === undefined ? {} : { instanceFactory }),
      }),
    );
  } else if (
    ast.is.IsPrefixUnaryExpression(node) ||
    ast.is.IsPostfixUnaryExpression(node)
  ) {
    const operand = ast.is.IsPrefixUnaryExpression(node)
      ? ast.as.AsPrefixUnaryExpression(node)?.Operand
      : ast.as.AsPostfixUnaryExpression(node)?.Operand;
    const sourceOperator = sourceOperatorFromKindName(
      ast.operatorKindName(node),
    ) ?? "";
    producer.unary.selected(node, Object.freeze({
        jsValue: selectCsharpJsValueUnaryOperation(
          policy,
          operand,
          sourceFile,
          sourceOperator,
        ),
        target: selectCsharpUnaryOperation(policy, node, sourceFile),
      }),
    );
  }
  if (
    ast.is.IsForOfStatement(node) ||
    ast.is.IsForInStatement(node)
  ) {
    const statement = AsForInOrOfStatement(ast, node);
    producer.iteration.selected(node, selectCsharpIteration(policy, node, statement?.Expression, sourceFile),
    );
  }
  if (ast.is.IsVariableDeclaration(node)) {
    const resource = policy.semantics(sourceFile).operations.resourceManagement(node);
    if (resource !== undefined) {
      producer.resource.selected(node, selectCsharpResourceManagement(policy, node, sourceFile),
      );
    }
  }
  if (ast.is.IsThrowStatement(node)) {
    const expression = ast.as.AsThrowStatement(node)?.Expression;
    if (expression !== undefined) {
      const sourceCarrier = policy.types.resolveNode(expression, sourceFile);
      producer.throwValue.selected(node, Object.freeze({ expression, sourceCarrier, targetCarrier: selectCsharpThrownOperandCarrier(policy, sourceCarrier, isCsharpThrowableType(policy, sourceCarrier)) }),
      );
      producer.exactCatchRethrow.selected(node, classifyExactUnmodifiedCatchRethrow(policy, node, expression),
      );
    }
  }
  if (ast.is.IsCatchClause(node)) {
    const variableDeclaration = ast.as.AsCatchClause(node)?.VariableDeclaration;
    const variableName = variableDeclaration === undefined
      ? undefined
      : ast.name(variableDeclaration);
    if (variableName !== undefined) {
      producer.throwable.selected(variableName, isCsharpThrowableType(
          policy,
          policy.types.resolveStorage(variableName, sourceFile),
        ),
      );
    }
  }
  ast.forEachChild(
    node,
    (child) => {
      if (child !== undefined) {
        analyzeCsharpOperationConstruct(
          child,
          sourceFile,
          policy,
          evidence,
          erasure,
          producer,
          binaryExecutionDrivers,
          erased ? undefined : issues,
        );
      }
    },
  );
  if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    producer.operatorForm.selected(node, selectCsharpOperatorForm(policy, node, producer.jsArrayMutation.get(node),
      producer.binary.get(node), producer.unary.get(node), (subject) => producer.property.get(subject)));
  }
}

function awaitResultMappingRejection(
  policy: CsharpPolicyContext,
  completion: CsharpAwaitCompletion | undefined,
): string | undefined {
  if (completion === undefined) return undefined;
  for (const alternative of completion.alternatives) {
    if (alternative.resultMapping === undefined) continue;
    const admitted = admitCsharpConversionSelection(policy, alternative.result, completion.result, alternative.resultMapping);
    if (admitted.kind === "rejected") return admitted.reason;
  }
  return undefined;
}
