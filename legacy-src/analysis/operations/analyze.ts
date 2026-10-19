import { classifyCsharpJsValueCallShape } from "./js-value-calls.js";
import { classifyCsharpSourceCallArguments } from "./source-call-arguments.js";
import { classifyCsharpUnionCall } from "./union-calls.js";
import { classifyCsharpSourceCallee } from "../../policy/types/callables/source-callees.js";
import { classifyCsharpBorrowedSequenceInput } from "./borrowed-sequences.js";
import { classifyCsharpClassPropertyStorage } from "./class-property-storage.js";
import { classifyTypeofComparison } from "./typeof-comparisons.js";
import { classifyMethodTypeArgumentProjections } from "./method-type-arguments.js";
import {
  createCsharpOperationErasure,
  csharpErasedExpressionStatement,
  type CsharpOperationErasure,
  type CsharpOperationErasureIndexes,
} from "./statement-erasure.js";
import type { CsharpAwaitCompletion } from "../../target-model/types/await-completions.js";
import { selectCsharpAwaitCompletion } from "../../policy/operations/control-flow/await-completions.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import { csharpOperationConversionIssue, csharpSelectedCallConversionIssue } from "./conversion-admission.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import { resolveCsharpInstanceType } from "../../policy/types/resolution/instance-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";
import { selectCsharpOperatorForm } from "../../policy/operations/operators/operator-forms.js";
import { selectCsharpArrayTypeTest } from "../../policy/operations/source-profiles/js/type-tests.js";
import { selectCsharpCallForm } from "../../policy/operations/members/selection/call-forms.js";
import { getCsharpTypeofResult, type CsharpTypeofResult } from "../../target-model/types/runtime-kind.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import { classifyCsharpOptionalCallCallee, classifyCsharpOptionalCallReceiver } from "./optional-calls.js";
import { selectCsharpMemoryBinding } from "../../policy/operations/memory-bindings.js";
import { analyzeCsharpNativeHandlers } from "./native-handlers.js";
import type { CsharpRequiredRecord } from "../program/records/required-records.js";
import { selectCsharpElementDeletion } from "../../policy/operations/collections/element-deletion.js";
import { selectCsharpSwitch } from "../../policy/operations/control-flow/switch.js";
import {
  createTargetClassificationBuilder,
  createTargetClassificationKey,
} from "@tsonic/target-api/analysis";
import type {
  TargetClassificationKey,
} from "@tsonic/target-api/analysis";
import {
  AsForInOrOfStatement,
  sourceClassFieldIsTypeOnly,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  selectCsharpJsValueCallOperation,
  selectCsharpJsValueBinaryOperation,
  selectCsharpJsValueReceiverExpressionOperation,
  selectCsharpJsValueUnaryOperation,
  selectCsharpJsTypeofOperation,
  selectCsharpJsValueCondition,
  selectCsharpJsValueVoidOperation,
  selectCsharpJsObjectLiteralOperation,
} from "../../policy/operations/js-values/index.js";
import {
  selectCsharpProviderValue,
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../../policy/operations/members/index.js";
import {
  selectCsharpBinaryOperation,
  selectCsharpDestructuringAssignmentOperation,
  selectCsharpIteration,
  selectCsharpNativePointerOperation,
  selectCsharpResourceManagement,
  selectCsharpSourceFlowCall,
  selectCsharpNativeRefReturn,
  selectCsharpTypedLocationOperation,
  selectCsharpUnaryOperation,
  sourceOperatorFromKindName,
  selectCsharpJsArrayMutation,
  selectCsharpJsStringConversion,
  selectCsharpRegularExpressionLiteral,
} from "../../policy/operations/index.js";
import {
  isCsharpThrowableType,
} from "../../policy/types/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpCallClassification, CsharpBinaryClassification, CsharpConstructionClassification, CsharpElementClassification, CsharpOperatorFormClassification, CsharpPropertyClassification, CsharpUnaryClassification, CsharpTargetOperationClassifications, CsharpOperationIssue } from "../../target-model/records/operations.js";
import {
  composeCsharpBinaryExecutionDriver,
} from "../../providers/model/provider-policy-contribution.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { classifyExactUnmodifiedCatchRethrow } from "./catch-rethrow.js";
import { selectCsharpThrownOperandCarrier } from "../../policy/conversions/program-error.js";
import {
  classifySourceOwnedMember,
  classifySourceOwnedElementMember,
  classifyCsharpMemberReceiver,
  elementSelectedTypes,
  optionalResultType,
} from "./member-access.js";

const callKey = createTargetClassificationKey<CsharpCallClassification>(
  "csharp.operation.call",
);
const awaitKey = createTargetClassificationKey<ReturnType<typeof selectCsharpAwaitCompletion>>("csharp.operation.await");
const memoryBindingKey = createTargetClassificationKey<ReturnType<typeof selectCsharpMemoryBinding>>("csharp.operation.memory-binding");
const elementDeletionKey = createTargetClassificationKey<ReturnType<typeof selectCsharpElementDeletion>>("csharp.operation.element-deletion");
const constructionKey = createTargetClassificationKey<CsharpConstructionClassification>(
  "csharp.operation.construction",
);
const propertyKey = createTargetClassificationKey<CsharpPropertyClassification>(
  "csharp.operation.property",
);
const elementKey = createTargetClassificationKey<CsharpElementClassification>(
  "csharp.operation.element",
);
const binaryKey = createTargetClassificationKey<CsharpBinaryClassification>(
  "csharp.operation.binary",
);
const unaryKey = createTargetClassificationKey<CsharpUnaryClassification>(
  "csharp.operation.unary",
);
const iterationKey = createTargetClassificationKey<ReturnType<typeof selectCsharpIteration>>(
  "csharp.operation.iteration",
);
const resourceKey = createTargetClassificationKey<ReturnType<typeof selectCsharpResourceManagement>>(
  "csharp.operation.resource",
);
const nativePointerKey = createTargetClassificationKey<ReturnType<typeof selectCsharpNativePointerOperation>>(
  "csharp.operation.native-pointer",
);
const typedLocationKey = createTargetClassificationKey<ReturnType<typeof selectCsharpTypedLocationOperation>>(
  "csharp.operation.typed-location",
);
const nativeRefReturnKey = createTargetClassificationKey<ReturnType<typeof selectCsharpNativeRefReturn>>(
  "csharp.operation.native-ref-return",
);
const jsConditionKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsValueCondition>>(
  "csharp.operation.js-condition",
);
const jsTypeofKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsTypeofOperation>>(
  "csharp.operation.js-typeof",
);
const typeofRuntimeKindKey = createTargetClassificationKey<CsharpTypeofResult>(
  "csharp.operation.typeof-runtime-kind",
);
const jsVoidKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsValueVoidOperation>>(
  "csharp.operation.js-void",
);
const jsObjectLiteralKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsObjectLiteralOperation>>(
  "csharp.operation.js-object-literal",
);
const jsArrayMutationKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsArrayMutation>>(
  "csharp.operation.js-array-mutation",
);
const jsStringConversionKey = createTargetClassificationKey<ReturnType<typeof selectCsharpJsStringConversion>>(
  "csharp.operation.js-string-conversion",
);
const switchKey = createTargetClassificationKey<ReturnType<typeof selectCsharpSwitch>>("csharp.operation.switch");
const providerValueKey = createTargetClassificationKey<ReturnType<typeof selectCsharpProviderValue>>(
  "csharp.operation.provider-value",
);
const regularExpressionKey = createTargetClassificationKey<ReturnType<typeof selectCsharpRegularExpressionLiteral>>(
  "csharp.operation.regular-expression",
);
const throwableKey = createTargetClassificationKey<boolean>(
  "csharp.operation.throwable",
);
const throwValueKey = createTargetClassificationKey<NonNullable<ReturnType<CsharpTargetOperationClassifications["throwValue"]["get"]>>>(
  "csharp.operation.throw-value",
);
const exactCatchRethrowKey = createTargetClassificationKey<boolean>(
  "csharp.operation.exact-catch-rethrow",
);
const nativeGuardResultKey = createTargetClassificationKey<boolean>("csharp.operation.native-guard-result");
const nativeUnreachableKey = createTargetClassificationKey<boolean>("csharp.operation.native-unreachable");
const erasedStatementKey = createTargetClassificationKey<boolean>("csharp.operation.erased-statement");
const operatorFormKey = createTargetClassificationKey<CsharpOperatorFormClassification>("csharp.operation.operator-form");
const borrowedSequenceKey = createTargetClassificationKey<ReturnType<typeof classifyCsharpBorrowedSequenceInput>>(
  "csharp.operation.borrowed-sequence",
);
const operationResultKeyIds: ReadonlySet<string> = new Set([memoryBindingKey.id, jsArrayMutationKey.id, callKey.id,
  constructionKey.id, propertyKey.id, elementKey.id, binaryKey.id, unaryKey.id]);

export function analyzeCsharpTargetOperations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  erasureIndexes: CsharpOperationErasureIndexes,
  nodes: readonly Node[],
  requirements: CsharpRequiredRecord[],
): CsharpTargetOperationClassifications {
  const builder = createTargetClassificationBuilder();
  const operationResultSubjects = new Set<Node>();
  const producer: ReturnType<typeof createTargetClassificationBuilder> = Object.freeze({
    ...builder,
    set<Value>(subject: Node, key: TargetClassificationKey<Value>, value: Value) {
      if (operationResultKeyIds.has(key.id)) operationResultSubjects.add(subject);
      return builder.set(subject, key, value);
    },
  });
  const classPropertyStorage = classifyCsharpClassPropertyStorage(policy, evidence);
  const binaryExecutionDrivers:
    import("../../target-model/metadata/provider-metadata.js").CsharpTargetBinaryExecutionDriver[] = [];
  const issues: CsharpOperationIssue[] = [];
  const erasure = createCsharpOperationErasure(policy.ast, erasureIndexes, issues);
  for (const sourceFile of policy.sourceFiles) {
    visit(
      sourceFile,
      sourceFile,
      policy,
      evidence,
      erasure,
      producer,
      binaryExecutionDrivers,
      issues,
    );
  }
  const nativeHandler = analyzeCsharpNativeHandlers(nodes, {
    memoryBinding: { get: node => builder.get(node, memoryBindingKey) },
    safetyOperation: erasure.safetyApplications.safetyOperation,
    jsStringConversion: { get: node => builder.get(node, jsStringConversionKey) },
    nativePointer: { get: node => builder.get(node, nativePointerKey) },
    typedLocation: { get: node => builder.get(node, typedLocationKey) },
  }, requirements);
  const facts = builder.seal();
  const operationResultTypes = new WeakMap<Node, import("../../target-model/types/model.js").TargetTypeRef>();
  for (const subject of operationResultSubjects) {
    const type = operationResultType(facts, subject);
    if (type !== undefined) operationResultTypes.set(subject, type);
  }
  const selectedBinaryExecutionDriver =
    composeCsharpBinaryExecutionDriver(...binaryExecutionDrivers);
  const classifications: CsharpTargetOperationClassifications = {
    issues: Object.freeze(issues),
    awaitCompletion: Object.freeze({ get: node => facts.get(node, awaitKey) }),
    classPropertyStorage: Object.freeze({ get: classPropertyStorage }),
    borrowedSequence: Object.freeze({ get: node => facts.get(node, borrowedSequenceKey) }),
    nativeGuardResult: Object.freeze({ get: node => facts.get(node, nativeGuardResultKey) }),
    nativeUnreachable: Object.freeze({ get: node => facts.get(node, nativeUnreachableKey) === true }),
    erasedStatement: Object.freeze({ get: node => facts.get(node, erasedStatementKey) === true }),
    nativeHandler,
    operatorForm: Object.freeze({ get: node => facts.get(node, operatorFormKey)?.form, usesExpectedResultType: node => facts.get(node, operatorFormKey)?.usesExpectedResultType }),
    binaryExecutionDriver: () => selectedBinaryExecutionDriver,
    operationResultType: Object.freeze({ get: (node) => operationResultTypes.get(node) }),
    selectedCall: Object.freeze({ get: (node) => facts.get(node, callKey) }),
    selectedConstruction: Object.freeze({ get: (node) => facts.get(node, constructionKey) }),
    selectedProperty: Object.freeze({ get: (node) => facts.get(node, propertyKey) }),
    sourceMember: Object.freeze({ get: node => facts.get(node, propertyKey)?.sourceOwned ?? facts.get(node, elementKey)?.sourceOwned }),
    selectedElement: Object.freeze({ get: (node) => facts.get(node, elementKey) }),
    binaryOperation: Object.freeze({ get: (node) => facts.get(node, binaryKey) }),
    switchStatement: Object.freeze({ get: (node) => facts.get(node, switchKey) }),
    unaryOperation: Object.freeze({ get: (node) => facts.get(node, unaryKey) }),
    iteration: Object.freeze({ get: (node) => facts.get(node, iterationKey) }),
    resource: Object.freeze({ get: (node) => facts.get(node, resourceKey) }),
    nativePointer: Object.freeze({ get: (node) => facts.get(node, nativePointerKey) }),
    typedLocation: Object.freeze({ get: (node) => facts.get(node, typedLocationKey) }),
    nativeRefReturn: Object.freeze({ get: (node) => facts.get(node, nativeRefReturnKey) }),
    jsCondition: Object.freeze({ get: (node) => facts.get(node, jsConditionKey) }),
    jsTypeof: Object.freeze({ get: (node) => facts.get(node, jsTypeofKey) }),
    typeofRuntimeKind: Object.freeze({ get: (node) => facts.get(node, typeofRuntimeKindKey) }),
    jsVoid: Object.freeze({ get: (node) => facts.get(node, jsVoidKey) }),
    jsObjectLiteral: Object.freeze({ get: (node) => facts.get(node, jsObjectLiteralKey) }),
    jsArrayMutation: Object.freeze({ get: (node) => facts.get(node, jsArrayMutationKey) }),
    elementDeletion: Object.freeze({ get: (node) => facts.get(node, elementDeletionKey) }),
    providerValue: Object.freeze({ get: (node) => facts.get(node, providerValueKey) }),
    regularExpression: Object.freeze({ get: (node) => facts.get(node, regularExpressionKey) }),
    throwable: Object.freeze({ get: (node) => facts.get(node, throwableKey) }),
    throwValue: Object.freeze({ get: (node) => facts.get(node, throwValueKey) }),
    exactCatchRethrow: Object.freeze({ get: (node) => facts.get(node, exactCatchRethrowKey) === true }),
  };
  return Object.freeze(classifications);
}

function visit(
  node: Node,
  sourceFile: SourceFile,
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  erasure: CsharpOperationErasure,
  builder: ReturnType<typeof createTargetClassificationBuilder>,
  binaryExecutionDrivers:
    import("../../target-model/metadata/provider-metadata.js").CsharpTargetBinaryExecutionDriver[],
  scopeIssues: CsharpOperationIssue[] | undefined,
): void {
  if (evidence.compileTimeMetadata.get(node)) return;
  if (policy.types.nativeUnreachable(node)) {
    setClassification(builder, node, nativeUnreachableKey, true);
    return;
  }
  const { ast } = policy;
  if (sourceClassFieldIsTypeOnly(ast, node)) return;
  const issues = erasure.demandedInvocations.has(node) ? erasure.issues : scopeIssues;
  const erased = ast.is.IsExpressionStatement(node) && csharpErasedExpressionStatement(ast, node, erasure);
  if (erased) setClassification(builder, node, erasedStatementKey, true);
  if (ast.is.IsAwaitExpression(node)) {
    const expression = ast.as.AsAwaitExpression(node)?.Expression;
    const completion = selectCsharpAwaitCompletion(
      expression === undefined ? undefined : policy.types.resolveNode(expression, sourceFile),
      policy.typeDefinitions);
    const rejection = awaitResultMappingRejection(policy, completion);
    if (rejection !== undefined) {
      issues?.push(Object.freeze({ node, code: "CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN", message: rejection }));
    }
    setClassification(builder, node, awaitKey, rejection === undefined ? completion : undefined);
  }
  if (ast.is.IsSpreadElement(node)) {
    const expression = ast.as.AsSpreadElement(node)?.Expression;
    if (expression !== undefined) {
      setClassification(builder, expression, borrowedSequenceKey,
        classifyCsharpBorrowedSequenceInput(policy, expression, sourceFile));
    }
  }
  if (ast.is.IsIfStatement(node)) {
    const expression = ast.as.AsIfStatement(node)?.Expression;
    const result = expression === undefined ? undefined : policy.types.nativeGuardResult(expression);
    if (expression !== undefined && result !== undefined) setClassification(builder, expression, nativeGuardResultKey, result);
  }
  if (ast.is.IsSwitchStatement(node)) {
    setClassification(builder, node, switchKey, selectCsharpSwitch(policy, node, sourceFile));
  }
  setClassification(
    builder,
    node,
    jsConditionKey,
    selectCsharpJsValueCondition(policy, node, sourceFile),
  );
  setClassification(
    builder,
    node,
    jsTypeofKey,
    selectCsharpJsTypeofOperation(policy, node, sourceFile),
  );
  if (ast.is.IsTypeOfExpression(node)) {
    const operand = ast.as.AsTypeOfExpression(node)?.Expression;
    const selected = operand === undefined ? undefined : getCsharpTypeofResult(policy.types.resolveNode(operand, sourceFile), undefined, policy.typeDefinitions);
    if (operand !== undefined && selected !== undefined) setClassification(builder, operand, typeofRuntimeKindKey, selected);
  }
  if (ast.is.IsIdentifier(node)) {
    setClassification(
      builder,
      node,
      providerValueKey,
      selectCsharpProviderValue(policy, node),
    );
  }
  if (
    ast.is.IsCallExpression(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node)
  ) {
    setClassification(
      builder,
      node,
      nativeRefReturnKey,
      selectCsharpNativeRefReturn(policy, node, sourceFile),
    );
  }
  if (ast.is.IsRegularExpressionLiteral(node)) {
    setClassification(
      builder,
      node,
      regularExpressionKey,
      selectCsharpRegularExpressionLiteral(policy, node, sourceFile),
    );
  }
  if (ast.is.IsCallExpression(node)) {
    setClassification(builder, node, memoryBindingKey, selectCsharpMemoryBinding(policy, node, sourceFile));
    setClassification(
      builder,
      node,
      jsStringConversionKey,
      selectCsharpJsStringConversion(policy, node, sourceFile),
    );
  }
  if (ast.is.IsDeleteExpression(node)) {
    setClassification(builder, node, elementDeletionKey, selectCsharpElementDeletion(policy, node, sourceFile));
  }
  if (ast.is.IsBinaryExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    setClassification(
      builder,
      node,
      jsArrayMutationKey,
      selectCsharpJsArrayMutation(policy, node, sourceFile),
    );
  }
  if (ast.is.IsVoidExpression(node)) {
    const operand = ast.as.AsVoidExpression(node)?.Expression;
    setClassification(
      builder,
      node,
      jsVoidKey,
      selectCsharpJsValueVoidOperation(policy, operand, sourceFile),
    );
  }
  if (ast.is.IsObjectLiteralExpression(node)) {
    setClassification(
      builder,
      node,
      jsObjectLiteralKey,
      selectCsharpJsObjectLiteralOperation(),
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
    setClassification(
      builder,
      node,
      nativePointerKey,
      selectCsharpNativePointerOperation(policy, node, sourceFile),
    );
    setClassification(
      builder,
      node,
      typedLocationKey,
      selectCsharpTypedLocationOperation(policy, node, sourceFile),
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
    setClassification(builder, node, callKey, Object.freeze({
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
    setClassification(builder, node, constructionKey, Object.freeze({
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
    setClassification(
      builder,
      node,
      propertyKey,
      Object.freeze({
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
    setClassification(builder, node, elementKey, Object.freeze({
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
    setClassification(
      builder,
      node,
      binaryKey,
      Object.freeze({
        jsValue: validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(
          policy,
          expression?.Left,
          expression?.Right,
          sourceFile,
          sourceOperator,
        )),
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
    setClassification(
      builder,
      node,
      unaryKey,
      Object.freeze({
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
    setClassification(
      builder,
      node,
      iterationKey,
      selectCsharpIteration(policy, node, statement?.Expression, sourceFile),
    );
  }
  if (ast.is.IsVariableDeclaration(node)) {
    const resource = policy.semantics(sourceFile).operations.resourceManagement(node);
    if (resource !== undefined) {
      setClassification(
        builder,
        node,
        resourceKey,
        selectCsharpResourceManagement(policy, node, sourceFile),
      );
    }
  }
  if (ast.is.IsThrowStatement(node)) {
    const expression = ast.as.AsThrowStatement(node)?.Expression;
    if (expression !== undefined) {
      const sourceCarrier = policy.types.resolveNode(expression, sourceFile);
      setClassification(
        builder,
        node,
        throwValueKey,
        Object.freeze({ expression, sourceCarrier, targetCarrier: selectCsharpThrownOperandCarrier(policy, sourceCarrier) }),
      );
      setClassification(
        builder,
        node,
        exactCatchRethrowKey,
        classifyExactUnmodifiedCatchRethrow(policy, node, expression),
      );
    }
  }
  if (ast.is.IsCatchClause(node)) {
    const variableDeclaration = ast.as.AsCatchClause(node)?.VariableDeclaration;
    const variableName = variableDeclaration === undefined
      ? undefined
      : ast.name(variableDeclaration);
    if (variableName !== undefined) {
      setClassification(
        builder,
        variableName,
        throwableKey,
        isCsharpThrowableType(
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
        visit(
          child,
          sourceFile,
          policy,
          evidence,
          erasure,
          builder,
          binaryExecutionDrivers,
          erased ? undefined : issues,
        );
      }
    },
  );
  if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    setClassification(builder, node, operatorFormKey, selectCsharpOperatorForm(policy, node, builder.get(node, jsArrayMutationKey),
      builder.get(node, binaryKey), builder.get(node, unaryKey), (subject) => builder.get(subject, propertyKey)));
  }
}

function operationResultType(
  facts: ReturnType<ReturnType<typeof createTargetClassificationBuilder>["seal"]>,
  node: Node,
): import("../../target-model/types/model.js").TargetTypeRef | undefined {
  const binding = facts.get(node, memoryBindingKey);
  if (binding !== undefined && binding.kind !== "rejected") return binding.type;
  const mutation = facts.get(node, jsArrayMutationKey);
  if (mutation?.kind === "set-typed-element" || mutation?.kind === "update-typed-element") return mutation.resultType;
  const call = facts.get(node, callKey);
  if (call?.selectedResultType !== undefined) {
    return call.selectedResultType;
  }
  const construction = facts.get(node, constructionKey);
  if (construction?.selectedResultType !== undefined) {
    return construction.selectedResultType;
  }
  const property = facts.get(node, propertyKey);
  if (property?.selection.kind === "union-property") return property.selection.resultCarrier;
  if (property?.selection.kind === "resolved") {
    return optionalResultType(
      property.selection.targetMember.returnType,
      property.selection.source.optionalChain,
    );
  }
  if (property?.sourceOwned !== undefined) {
    return property.sourceOwned.jsValueOperation.kind === "resolved"
      ? property.sourceOwned.jsValueOperation.resultType
      : property.sourceOwned.selectedReadType;
  }
  const element = facts.get(node, elementKey);
  if (element?.jsValue.kind === "resolved") {
    return element.jsValue.resultType;
  }
  if (element?.target?.kind === "resolved") {
    return optionalResultType(
      element.target.targetMember.returnType,
      element.target.source.optionalChain,
    );
  }
  if (element?.selectedResultType !== undefined) {
    return element.selectedResultType;
  }
  const binary = facts.get(node, binaryKey);
  if (binary?.destructuring.kind === "resolved") {
    return binary.destructuring.resultType;
  }
  if (binary?.jsValue.kind === "resolved") {
    return binary.jsValue.resultType;
  }
  if (binary?.target.kind === "resolved") {
    return binary.target.resultType;
  }
  const unary = facts.get(node, unaryKey);
  if (unary?.jsValue.kind === "resolved") {
    return unary.jsValue.resultType;
  }
  return unary?.target.kind === "resolved"
    ? unary.target.resultType
    : undefined;
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

function setClassification<Value>(
  builder: ReturnType<typeof createTargetClassificationBuilder>,
  subject: object,
  key: TargetClassificationKey<Value>,
  value: Value,
): void {
  const result = builder.set(subject, key, value);
  if (result.kind === "conflict") {
    throw new Error(`Conflicting target classification '${key.id}'.`);
  }
}
