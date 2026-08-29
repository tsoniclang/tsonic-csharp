import {
  createTargetClassificationBuilder,
  createTargetClassificationKey,
} from "@tsonic/target-api/analysis";
import type {
  TargetClassificationKey,
} from "@tsonic/target-api/analysis";
import {
  AsForInOrOfStatement,
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
} from "../../policy/js-value-operations/index.js";
import {
  selectCsharpProviderValue,
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
import type {
  CsharpSelectedTargetCall,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import {
  selectCsharpBinaryOperation,
  selectCsharpDestructuringAssignmentOperation,
  selectCsharpTypeofComparison,
  getCsharpTypeofRuntimeKind,
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
import type {
  CsharpTypeofRuntimeKind,
} from "../../policy/types/index.js";
import {
  isCsharpThrowableType,
} from "../../policy/types/index.js";
import type { CsharpPolicyContext } from "../../policy/context.js";
import type {
  CsharpCallClassification,
  CsharpBinaryClassification,
  CsharpConstructionClassification,
  CsharpElementClassification,
  CsharpPropertyClassification,
  CsharpUnaryClassification,
  CsharpTargetOperationClassifications,
} from "./model.js";
import {
  composeCsharpBinaryEpilogues,
} from "../../providers/model/provider-policy-contribution.js";
import type {
  CsharpSourceEvidenceIndex,
} from "../source-evidence/index.js";
import { classifyExactUnmodifiedCatchRethrow } from "./catch-rethrow.js";
import {
  classifySourceOwnedProperty,
  elementSelectedTypes,
  optionalResultType,
} from "./member-access.js";

const callKey = createTargetClassificationKey<CsharpCallClassification>(
  "csharp.operation.call",
);
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
const typeofRuntimeKindKey = createTargetClassificationKey<CsharpTypeofRuntimeKind>(
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
const providerValueKey = createTargetClassificationKey<ReturnType<typeof selectCsharpProviderValue>>(
  "csharp.operation.provider-value",
);
const regularExpressionKey = createTargetClassificationKey<ReturnType<typeof selectCsharpRegularExpressionLiteral>>(
  "csharp.operation.regular-expression",
);
const throwableKey = createTargetClassificationKey<boolean>(
  "csharp.operation.throwable",
);
const exactCatchRethrowKey = createTargetClassificationKey<boolean>(
  "csharp.operation.exact-catch-rethrow",
);
export function analyzeCsharpTargetOperations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): CsharpTargetOperationClassifications {
  const builder = createTargetClassificationBuilder();
  const binaryEpilogues:
    import("../../target-model/types/model.js").CsharpTargetBinaryEpilogue[] = [];
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile, policy, evidence, builder, binaryEpilogues);
  }
  const facts = builder.seal();
  const selectedBinaryEpilogues = composeCsharpBinaryEpilogues(binaryEpilogues);
  const classifications: CsharpTargetOperationClassifications = {
    binaryEpilogues: () => selectedBinaryEpilogues,
    resultType: (node) => operationResultType(facts, node),
    call: (node) => facts.get(node, callKey),
    construction: (node) => facts.get(node, constructionKey),
    property: (node) => facts.get(node, propertyKey),
    element: (node) => facts.get(node, elementKey),
    binary: (node) => facts.get(node, binaryKey),
    unary: (node) => facts.get(node, unaryKey),
    iteration: (node) => facts.get(node, iterationKey),
    resource: (node) => facts.get(node, resourceKey),
    nativePointer: (node) => facts.get(node, nativePointerKey),
    typedLocation: (node) => facts.get(node, typedLocationKey),
    nativeRefReturn: (node) => facts.get(node, nativeRefReturnKey),
    jsCondition: (node) => facts.get(node, jsConditionKey),
    jsTypeof: (node) => facts.get(node, jsTypeofKey),
    typeofRuntimeKind: (node) => facts.get(node, typeofRuntimeKindKey),
    jsVoid: (node) => facts.get(node, jsVoidKey),
    jsObjectLiteral: (node) => facts.get(node, jsObjectLiteralKey),
    jsArrayMutation: (node) => facts.get(node, jsArrayMutationKey),
    jsStringConversion: (node) => facts.get(node, jsStringConversionKey),
    providerValue: (node) => facts.get(node, providerValueKey),
    regularExpression: (node) => facts.get(node, regularExpressionKey),
    throwable: (node) => facts.get(node, throwableKey),
    exactCatchRethrow: (node) => facts.get(node, exactCatchRethrowKey) === true,
  };
  return Object.freeze(classifications);
}

function visit(
  node: Node,
  sourceFile: SourceFile,
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  builder: ReturnType<typeof createTargetClassificationBuilder>,
  binaryEpilogues: import("../../target-model/types/model.js").CsharpTargetBinaryEpilogue[],
): void {
  const { ast } = policy;
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
  const typeofRuntimeKind = getCsharpTypeofRuntimeKind(
    policy.types.resolveNode(node, sourceFile),
  );
  if (typeofRuntimeKind !== undefined) {
    setClassification(
      builder,
      node,
      typeofRuntimeKindKey,
      typeofRuntimeKind,
    );
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
    setClassification(
      builder,
      node,
      jsStringConversionKey,
      selectCsharpJsStringConversion(policy, node, sourceFile),
    );
  }
  if (ast.is.IsDeleteExpression(node) || ast.is.IsBinaryExpression(node)) {
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
    const shape = jsValueCallShape(policy, source);
    const jsValue = selectCsharpJsValueCallOperation(
      policy,
      callee,
      shape.receiver,
      sourceFile,
      shape.kind,
      expression?.QuestionDotToken !== undefined,
    );
    const target = jsValue.kind === "not-js-value"
      ? selectCsharpTargetCall(policy, node, sourceFile)
      : undefined;
    if (target?.kind === "resolved") {
      binaryEpilogues.push(...(target.call.targetMember.csharpBinaryEpilogues ?? []));
    }
    const selectedResultType = jsValue.kind === "resolved"
      ? jsValue.resultType
      : policy.types.resolveNode(node, sourceFile);
    setClassification(builder, node, callKey, Object.freeze({
      ...(source === undefined ? {} : { source }),
      sourceFlow: selectCsharpSourceFlowCall(policy, node),
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
      ...(source === undefined
        ? {}
        : {
            sourceTypeArguments:
              policy.types.resolveSourceCallTypeArguments(source, sourceFile),
            sourceParameterTypes: Object.freeze(
              source.sourceSelectedSignatureParameters.map((_, index) =>
                policy.types.resolveSourceCallParameter(
                  source,
                  index,
                  sourceFile,
                )),
            ),
            sourceArgumentParameterTypes: Object.freeze(
              source.sourceArgumentBindings.map((binding) =>
                policy.types.resolveSourceCallArgumentParameter(
                  source,
                  binding,
                  sourceFile,
                )),
            ),
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
    const target = jsValue.kind === "not-js-value"
      ? selectCsharpTargetCall(policy, node, sourceFile)
      : undefined;
    if (target?.kind === "resolved") {
      binaryEpilogues.push(...(target.call.targetMember.csharpBinaryEpilogues ?? []));
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
            sourceParameterTypes: Object.freeze(
              target.source.sourceSelectedSignatureParameters.map((_, index) =>
                policy.types.resolveSourceCallParameter(
                  target.source,
                  index,
                  sourceFile,
                )),
            ),
            sourceArgumentParameterTypes: Object.freeze(
              target.source.sourceArgumentBindings.map((binding) =>
                policy.types.resolveSourceCallArgumentParameter(
                  target.source,
                  binding,
                  sourceFile,
                )),
            ),
          }
        : {},
    }));
  } else if (ast.is.IsPropertyAccessExpression(node)) {
    const selection = selectCsharpTargetProperty(policy, node, sourceFile);
    setClassification(
      builder,
      node,
      propertyKey,
      Object.freeze({
        selection,
        ...(selection.kind === "source-owned"
          ? {
              sourceOwned: classifySourceOwnedProperty(
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
    const jsValue = selectCsharpJsValueReceiverExpressionOperation(
      policy,
      expression?.Expression,
      sourceFile,
      "element-read",
      expression?.QuestionDotToken !== undefined,
    );
    setClassification(builder, node, elementKey, Object.freeze({
      jsValue,
      ...(source === undefined
        ? {}
        : elementSelectedTypes(policy, source, sourceFile)),
      ...(jsValue.kind === "not-js-value"
        ? { target: selectCsharpTargetElement(policy, node, sourceFile) }
        : {}),
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
    const typeofComparison = classifyTypeofComparison(
      policy,
      expression?.Left,
      expression?.Right,
      sourceOperator,
      sourceFile,
    ) ?? classifyTypeofComparison(
      policy,
      expression?.Right,
      expression?.Left,
      sourceOperator,
      sourceFile,
    );
    setClassification(
      builder,
      node,
      binaryKey,
      Object.freeze({
        jsValue: selectCsharpJsValueBinaryOperation(
          policy,
          expression?.Left,
          expression?.Right,
          sourceFile,
          sourceOperator,
        ),
        target: selectCsharpBinaryOperation(
          policy,
          node,
          evidence.nodeTargetType,
        ),
        destructuring: selectCsharpDestructuringAssignmentOperation(
          policy,
          node,
          sourceFile,
        ),
        ...(propertyWrite === undefined ? {} : { propertyWrite }),
        ...(elementWrite === undefined ? {} : { elementWrite }),
        ...(typeofComparison === undefined ? {} : { typeofComparison }),
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
      setClassification(
        builder,
        expression,
        throwableKey,
        isCsharpThrowableType(
          policy,
          policy.types.resolveNode(expression, sourceFile),
        ),
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
          builder,
          binaryEpilogues,
        );
      }
    },
  );
}

function classifyTypeofComparison(
  policy: CsharpPolicyContext,
  typeofNode: Node | undefined,
  literalNode: Node | undefined,
  sourceOperator: string,
  sourceFile: SourceFile,
): CsharpBinaryClassification["typeofComparison"] {
  if (
    (sourceOperator !== "===" && sourceOperator !== "==" &&
      sourceOperator !== "!==" && sourceOperator !== "!=") ||
    typeofNode === undefined ||
    literalNode === undefined ||
    !policy.ast.is.IsTypeOfExpression(typeofNode) ||
    !policy.ast.is.IsStringLiteral(literalNode)
  ) {
    return undefined;
  }
  const operand = policy.ast.as.AsTypeOfExpression(typeofNode)?.Expression;
  const runtimeKind = runtimeKindLiteral(policy.ast.text(literalNode));
  if (operand === undefined || runtimeKind === undefined) {
    return undefined;
  }
  return Object.freeze({
    operand,
    runtimeKind,
    selection: selectCsharpTypeofComparison(
      policy.types.resolveNode(operand, sourceFile),
      runtimeKind,
      sourceOperator === "!==" || sourceOperator === "!=",
    ),
  });
}

function runtimeKindLiteral(
  value: string,
): CsharpTypeofRuntimeKind | undefined {
  return value === "string" ||
      value === "number" ||
      value === "boolean" ||
      value === "bigint"
    ? value
    : undefined;
}

function operationResultType(
  facts: ReturnType<ReturnType<typeof createTargetClassificationBuilder>["seal"]>,
  node: Node,
): import("../../target-model/types/model.js").TargetTypeRef | undefined {
  const call = facts.get(node, callKey);
  if (call?.selectedResultType !== undefined) {
    return call.selectedResultType;
  }
  const construction = facts.get(node, constructionKey);
  if (construction?.selectedResultType !== undefined) {
    return construction.selectedResultType;
  }
  const property = facts.get(node, propertyKey);
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
  if (element?.target?.kind === "project-indexer") {
    return element.target.selectedReadType ?? element.target.valueType;
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

function classifyMethodTypeArgumentProjections(
  policy: CsharpPolicyContext,
  selection: CsharpSelectedTargetCall,
  contextNode: Node,
  sourceFile: SourceFile,
): NonNullable<
  CsharpCallClassification["methodTypeArgumentProjections"]
> {
  const projections = selection.targetMember
    .csharpMethodTypeArgumentProjections ?? [];
  return Object.freeze(projections.flatMap((projection) => {
    const argument = selection.targetMethodTypeArguments[
      projection.targetTypeParameterIndex
    ];
    if (argument?.kind !== "selected-source") {
      return [];
    }
    return [Object.freeze({
      targetTypeParameterIndex: projection.targetTypeParameterIndex,
      projection: policy.objectShapes.resolveProjectConstructibleSelectedType(
        argument.targetType,
        argument.explicitTypeNode,
        argument.selectedType,
        contextNode,
        sourceFile,
      ),
    })];
  }));
}

type JsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | { readonly kind: "property" | "element"; readonly receiver: Node | undefined };

function jsValueCallShape(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo | undefined,
): JsValueCallShape {
  const access = source?.sourceCalleeAccess;
  if (
    access?.kind === "property" &&
    policy.ast.is.IsPropertyAccessExpression(access.expression)
  ) {
    return { kind: "property", receiver: access.receiver.expression };
  }
  if (
    access?.kind === "element" &&
    policy.ast.is.IsElementAccessExpression(access.expression)
  ) {
    return { kind: "element", receiver: access.receiver.expression };
  }
  return { kind: "direct" };
}
