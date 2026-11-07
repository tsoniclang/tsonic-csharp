import { analyzeCsharpCallOperation } from "./call-operation.js";
import { classifyCsharpNativeCallArguments, classifyCsharpSourceCallArguments } from "./source-call-arguments.js";
import { classifyCsharpBorrowedSequenceInput } from "./borrowed-sequences.js";

import { classifyTypeofComparison, selectCsharpTypeofSelection } from "./typeof-comparisons.js";
import { isCsharpRefusal } from "../../representation/index.js";
import { classifyMethodTypeArgumentProjections } from "./method-type-arguments.js";
import { csharpErasedExpressionStatement, type CsharpOperationErasure } from "./statement-erasure.js";
import type { CsharpAwaitCompletion } from "../../target-model/types/await-completions.js";
import { csharpHostAwaitedArms, selectCsharpSourceCallAwaitCompletion } from "../../policy/operations/control-flow/await-completions.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "./conversion-admission.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { sourceUnionRelation } from "../program/source-facts.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";
import { selectCsharpOperatorForm } from "../../policy/operations/operators/operator-forms.js";
import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import { selectCsharpMemoryBinding } from "./memory-bindings.js";

import { selectCsharpElementDeletion } from "./collections/element-deletion.js";
import { selectCsharpSwitch } from "./control-flow/switch.js";
import { AsForInOrOfStatement, sourceClassFieldIsTypeOnly, sourceExpressionSequence } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import { selectCsharpJsValueBinaryOperation, selectCsharpJsValueReceiverExpressionOperation, selectCsharpJsValueUnaryOperation, selectCsharpJsTypeofOperation, selectCsharpJsValueCondition, selectCsharpJsValueVoidOperation } from "./js-values.js";
import { selectCsharpProviderValue } from "./members/values.js";
import { selectCsharpTargetProperty } from "./members/selected-members.js";
import { selectCsharpTargetElement } from "./members/selected-members.js";
import { selectCsharpTargetCall } from "./members/selected-members.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { selectCsharpNativePointerOperation } from "./pointers/native-pointers.js";
import { selectCsharpJsArrayMutation } from "./collections/js-array-mutations.js";
import { selectCsharpJsStringConversion } from "./strings/explicit-js-string.js";
import { csharpTypedLocationLoweringRefusal, selectCsharpNativeRefReturn, selectCsharpTypedLocationOperation } from "./typed-locations.js";
import { selectCsharpRefusedTypedLocationOperandCall } from "./typed-location-operands.js";
import { selectCsharpRegularExpressionLiteral } from "./syntax/regexp-literal.js";
import { selectCsharpResourceManagement } from "../control-flow/resource-management.js";
import { selectCsharpBinaryOperation, selectCsharpDestructuringAssignmentOperation, selectCsharpUnaryOperation } from "./operators.js";
import { selectCsharpIteration } from "./iteration/selection.js";
import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";

import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { classifyExactUnmodifiedCatchRethrow } from "./catch-rethrow.js";
import { selectCsharpThrownOperandCarrier } from "../../policy/conversions/program-error.js";
import { classifySourceOwnedMember, classifySourceOwnedElementMember, classifyCsharpMemberReceiver, elementSelectedTypes } from "./member-access.js";

import type { CsharpOperationProducer } from "../program/records/operations/operations.js";

export function analyzeCsharpOperationConstruct(
  node: Node,
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  erasure: CsharpOperationErasure,
  producer: CsharpOperationProducer,
  binaryExecutionDrivers:
    import("../../target-model/types/model.js").CsharpTargetBinaryExecutionDriver[],
  scopeIssues: CsharpOperationIssue[] | undefined,
): void {
  if (evidence.compileTimeMetadata.get(node)) return;
  if (policy.facts.navigation.scopes.unreachable(node)) {
    producer.nativeUnreachable.selected(node, true);
    return;
  }
  const { ast } = policy;
  if (erasure.errorNameInitializations.has(node)) {
    producer.erasedStatement.selected(node, true);
    return;
  }
  if (sourceClassFieldIsTypeOnly(ast, node)) return;
  const issues = erasure.demandedInvocations.has(node) ? erasure.issues : scopeIssues;
  const erased = ast.is.IsExpressionStatement(node) && csharpErasedExpressionStatement(ast, node, erasure);
  if (erased) producer.erasedStatement.selected(node, true);
  if (ast.is.IsSpreadElement(node)) {
    const expression = ast.as.AsSpreadElement(node)?.Expression;
    if (expression !== undefined) {
      producer.borrowedSequence.selected(expression, classifyCsharpBorrowedSequenceInput(policy, expression));
    }
  }
  if (ast.is.IsIfStatement(node) || ast.is.IsForStatement(node)) {
    const forCondition = ast.is.IsForStatement(node) ? ast.as.AsForStatement(node)?.Condition : undefined;
    const forConditions = forCondition === undefined ? undefined : sourceExpressionSequence(ast, forCondition);
    const expression = ast.is.IsIfStatement(node) ? ast.as.AsIfStatement(node)?.Expression
      : forConditions === undefined ? undefined : forConditions[forConditions.length - 1];
    const result = expression === undefined ? undefined : policy.types.nativeGuardResult(expression);
    if (expression !== undefined && result !== undefined) producer.nativeGuardResult.selected(expression, result);
  }
  if (ast.is.IsSwitchStatement(node)) {
    producer.switch.selected(node, selectCsharpSwitch(policy, node));
  }
  producer.jsCondition.selected(node, selectCsharpJsValueCondition(policy, node),
  );
  producer.jsTypeof.selected(node, selectCsharpJsTypeofOperation(policy, node),
  );
  if (ast.is.IsTypeOfExpression(node)) {
    // A dynamic operand (an opaque JS value) is typed at run time by the jsTypeof operation published for the operand
    // node; only a closed operand records a static category. A refused selection is reported once, by the typeof
    // emission (analyzeCsharpTypeofEmission), which finds no category for this operand (K-2665).
    const operand = ast.as.AsTypeOfExpression(node)?.Expression;
    const selected = operand === undefined ? undefined : selectCsharpTypeofSelection(policy, node, operand);
    if (operand !== undefined && selected?.kind === "static") producer.typeofRuntimeKind.selected(operand, selected.result);
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
    producer.nativeRefReturn.selected(node, selectCsharpNativeRefReturn(policy, node),
    );
  }
  if (ast.is.IsRegularExpressionLiteral(node)) {
    const selection = selectCsharpRegularExpressionLiteral(policy, node);
    if (selection.kind === "rejected") issues?.push(Object.freeze({ node, code: selection.code, message: selection.message }));
    producer.regularExpression.selected(node, selection,
    );
  }
  if (ast.is.IsCallExpression(node)) {
    const memoryBinding = selectCsharpMemoryBinding(policy, node);
    if (memoryBinding?.kind === "rejected") issues?.push(Object.freeze({ node, code: memoryBinding.code, message: memoryBinding.reason }));
    producer.memoryBinding.selected(node, memoryBinding);
    const stringConversion = selectCsharpJsStringConversion(policy, node);
    if (stringConversion.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_JS_STRING_CONVERSION_REJECTED", message: stringConversion.reason }));
    producer.jsStringConversion.selected(node, stringConversion);
  }
  if (ast.is.IsDeleteExpression(node)) {
    const selection = selectCsharpElementDeletion(policy, node);
    if (selection.kind === "rejected") issues?.push(Object.freeze({ node, code: selection.code, message: selection.reason }));
    producer.elementDeletion.selected(node, selection);
  }
  if (ast.is.IsBinaryExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    const arrayMutation = selectCsharpJsArrayMutation(policy, node);
    if (arrayMutation.kind === "rejected") issues?.push(Object.freeze({ node, code: arrayMutation.code, message: arrayMutation.reason }));
    producer.jsArrayMutation.selected(node, arrayMutation);
  }
  if (ast.is.IsVoidExpression(node)) {
    const operand = ast.as.AsVoidExpression(node)?.Expression;
    producer.jsVoid.selected(node, selectCsharpJsValueVoidOperation(policy, operand),
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
  const typedLocation = operationNode ? selectCsharpTypedLocationOperation(policy, node) : undefined;
  if (operationNode) {
    const nativePointer = selectCsharpNativePointerOperation(policy, node);
    if (nativePointer.kind === "rejected") issues?.push(Object.freeze({ node, code: "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      message: `C# native-pointer '${nativePointer.operation}' is not mapped: ${nativePointer.reason}` }));
    producer.nativePointer.selected(node, nativePointer,
    );
    if (typedLocation?.kind === "rejected") {
      const root = selectCsharpRefusedTypedLocationOperandCall(policy, node);
      if (root === undefined) issues?.push(Object.freeze({ node, code: typedLocation.code ?? "CSHARP_TYPED_LOCATION_NOT_LOWERED",
        message: csharpTypedLocationLoweringRefusal(typedLocation.operation, typedLocation.reason) }));
      else if (!issues?.some(issue => issue.node === root.node && issue.code === root.code)) issues?.push(root);
    }
    producer.typedLocation.selected(node, typedLocation!);
  }
  if (ast.is.IsCallExpression(node)) {
    analyzeCsharpCallOperation(node, policy, producer, typedLocation, binaryExecutionDrivers, issues);
  } else if (ast.is.IsNewExpression(node)) {
    const expression = ast.as.AsNewExpression(node);
    const jsValue = selectCsharpJsValueReceiverExpressionOperation(
      policy,
      expression?.Expression,
      "construct",
    );
    const selectedTarget = jsValue.kind === "not-js-value"
      ? selectCsharpTargetCall(policy, node)
      : undefined;
    const conversionIssue = csharpSelectedCallConversionIssue(policy, selectedTarget);
    if (conversionIssue !== undefined) issues?.push(conversionIssue);
    const target = conversionIssue === undefined ? selectedTarget : undefined;
    if (target?.kind === "resolved") {
      const driver = target.call.targetMember.csharpBinaryExecutionDriver;
      if (driver !== undefined) binaryExecutionDrivers.push(driver);
    }
    const constructed = jsValue.kind === "resolved" ? undefined : policy.types.value(node);
    // A refused own value carrier is reported once, by the source evidence at its site (R4 #67).
    const selectedResultType = jsValue.kind === "resolved"
      ? jsValue.resultType
      : constructed !== undefined && !isCsharpRefusal(constructed) ? constructed : undefined;
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
                issues,
              ),
          }
        : {},
      ...target?.kind === "source-owned" || target?.kind === "resolved"
        ? {
            ...(target.kind === "resolved"
              ? classifyCsharpNativeCallArguments(target.source, target)
              : classifyCsharpSourceCallArguments(policy, target.source, undefined, undefined)),
          }
        : {},
    }));
  } else if (ast.is.IsPropertyAccessExpression(node)) {
    const selection = selectCsharpTargetProperty(policy, node);
    const selectedReceiver = selection.kind === "resolved" || selection.kind === "source-owned"
      ? classifyCsharpMemberReceiver(policy, selection.source) : undefined;
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
              ),
            }
          : {}),
      }),
    );
  } else if (ast.is.IsElementAccessExpression(node)) {
    const expression = ast.as.AsElementAccessExpression(node);
    const source = policy.facts.values.elementAccess(node);
    const selectedReceiver = classifyCsharpMemberReceiver(policy, source);
    const receiverIssue = csharpOperationConversionIssue(node, selectedReceiver?.conversion, "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN");
    if (receiverIssue !== undefined) issues?.push(receiverIssue);
    const receiverProjection = receiverIssue === undefined ? selectedReceiver : undefined;
    const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverExpressionOperation(
      policy,
      expression?.Expression,
      "element-read",
      expression?.QuestionDotToken !== undefined,
    ));
    const target = jsValue.kind === "not-js-value" ? selectCsharpTargetElement(policy, node) : undefined;
    const sourceOwned = classifySourceOwnedElementMember(policy, target);
    const selectedTypes = elementSelectedTypes(policy, source, target);
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
          "element-write",
          ast.as.AsElementAccessExpression(expression.Left)
              ?.QuestionDotToken !== undefined,
        )
      : undefined;
    const typeofComparison = classifyTypeofComparison(policy, node);
    const constructor = sourceOperator === "instanceof" ? expression?.Right : undefined;
    const instanceType = constructor === undefined ? undefined
      : csharpInstanceType(policy, node, constructor);
    const instanceFactory = sourceOperator === "instanceof" && expression?.Right !== undefined
      ? evidence.nodeTargetType.get(expression.Right) : undefined;
    const instanceSource = sourceOperator === "instanceof" && expression?.Left !== undefined
      ? evidence.nodeTargetType.get(expression.Left) : undefined;
    const instancePredicate = instanceType === undefined ? undefined : Object.freeze({ kind: "nominal" as const, targetCarrier: instanceType });
    const instancePlan = instanceSource === undefined || instancePredicate === undefined ? undefined
      : selectCsharpClosedTypeTestPlan(instanceSource, instancePredicate, undefined, policy.typeDefinitions);
    const jsValue = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(
      policy, expression?.Left, expression?.Right, sourceOperator));
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
          sourceOperator,
        ),
        target: selectCsharpUnaryOperation(policy, node),
      }),
    );
  }
  if (
    ast.is.IsForOfStatement(node) ||
    ast.is.IsForInStatement(node)
  ) {
    const statement = AsForInOrOfStatement(ast, node);
    const iterable = statement?.Expression;
    producer.iteration.selected(node, selectCsharpIteration(policy, node, iterable,
      iterable === undefined ? undefined : evidence.valueRefinement.get(iterable)?.flowReadTargetType));
  }
  if (ast.is.IsVariableDeclaration(node)) {
    if (policy.facts.selections.resource(node) !== undefined) {
      producer.resource.selected(node, selectCsharpResourceManagement(policy, node),
      );
    }
  }
  if (ast.is.IsThrowStatement(node)) {
    const expression = ast.as.AsThrowStatement(node)?.Expression;
    if (expression !== undefined) {
      const thrown = policy.types.value(expression);
      // A refused operand value carrier is reported once, by the source evidence at the operand (R4 #67).
      const sourceCarrier = isCsharpRefusal(thrown) ? undefined : thrown;
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
    if (variableName !== undefined && variableDeclaration !== undefined) {
      const storage = policy.types.storage(variableDeclaration);
      if (isCsharpRefusal(storage)) issues?.push(Object.freeze({ node: variableName, code: storage.code, message: storage.message }));
      producer.throwable.selected(variableName, isCsharpThrowableType(
          policy,
          isCsharpRefusal(storage) ? undefined : storage,
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
  // After the operand's own records: a source-call operand's adoption (call record sourceResult) composes the await.
  if (ast.is.IsAwaitExpression(node)) analyzeCsharpAwait(node, policy, producer, issues);
  if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    producer.operatorForm.selected(node, selectCsharpOperatorForm(policy, node, producer.jsArrayMutation.get(node),
      producer.binary.get(node), producer.unary.get(node), (subject) => producer.property.get(subject)));
  }
}

/**
 * The completion of `await e`: the operand carrier (the call record's selected result when the operand is a source call
 * with a call-site adoption, else the operand value) and the Host's awaited result (values.awaited).
 */
function analyzeCsharpAwait(
  node: Node,
  policy: CsharpPolicyContext,
  producer: CsharpOperationProducer,
  issues: CsharpOperationIssue[] | undefined,
): void {
  const expression = policy.ast.as.AsAwaitExpression(node)?.Expression;
  const operand = expression === undefined ? undefined : policy.facts.navigation.expressions.transparentOperand(expression);
  const sourceResult = operand === undefined ? undefined : producer.call.get(operand)?.sourceResult;
  const operandCarrier = expression === undefined ? undefined
    : sourceResult?.completion !== undefined ? sourceResult.selectedType : policy.types.value(expression);
  const awaitedCarrier = policy.types.awaited(node);
  // A refused operand or awaited carrier (the await's own value, values.awaited(await) = values.type(await)) is reported
  // once, by the source evidence at its site (R4 #67).
  const completion = operandCarrier === undefined || isCsharpRefusal(operandCarrier) ||
    isCsharpRefusal(awaitedCarrier) ? undefined : selectCsharpSourceCallAwaitCompletion(operandCarrier, awaitedCarrier,
      policy.typeDefinitions, policy.facts.navigation.expressions.resultUse(node), csharpHostAwaitedArms(policy.facts, node), sourceResult);
  const rejection = awaitResultMappingRejection(policy, completion);
  if (rejection !== undefined) {
    issues?.push(Object.freeze({ node, code: "CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN", message: rejection }));
  }
  producer.await.selected(node, rejection === undefined ? completion : undefined);
}

function awaitResultMappingRejection(
  policy: CsharpPolicyContext,
  completion: CsharpAwaitCompletion | undefined,
): string | undefined {
  if (completion === undefined) return undefined;
  const pending: CsharpAwaitCompletion[] = [completion];
  while (pending.length > 0) {
    const phase = pending.pop()!;
    if (phase.adoption !== undefined) {
      pending.push(phase.adoption.continuation, phase.adoption.native);
      continue;
    }
    for (const alternative of phase.alternatives) {
      if (alternative.resultMapping === undefined) continue;
      const admitted = admitCsharpConversionSelection(policy, alternative.result, phase.result, alternative.resultMapping);
      if (admitted.kind === "rejected") return admitted.reason;
    }
  }
  return undefined;
}

/**
 * The instance carrier `x instanceof C` tests: the Host instance type of the test (relations.at(test).instance, the
 * instance type the right operand constructs), represented once (I6). C# never derives it from construct signatures.
 */
function csharpInstanceType(policy: CsharpPolicyContext, test: Node, constructor: Node): TargetTypeRef | undefined {
  const relation = sourceUnionRelation(policy.facts, test);
  if (relation?.kind !== "test" || relation.test !== "instanceof") return failTargetAnalysisInvariant("tsonic-csharp",
    "An instanceof test requires its Host test relation.", test);
  if (relation.instance === undefined) return undefined;
  const instance = policy.types.represent(relation.instance, constructor, "value");
  return isCsharpRefusal(instance) ? undefined : instance;
}
