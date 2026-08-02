import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpBinaryOperation,
  sourceOperatorFromKindName,
} from "../../policy/operations/index.js";
import {
  selectCsharpCompatAnyBinaryOperation,
  selectCsharpCompatAnyReceiverOperation,
} from "../../policy/compat/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanJsArrayLengthMutationExpression,
} from "./expression-js-array-mutations.js";
import {
  planBinaryOperand,
} from "./expression-operators/operands.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";
import {
  HasSourceKind,
  KindBinaryExpression,
} from "./source-ast.js";
import {
  translateCsharpCompatInvocation,
} from "../../translate/expressions/compat.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export {
  planTypeofExpression,
} from "./expression-typeof-operators.js";
export {
  tryPlanBinaryExpressionWithExpectedType,
} from "./expression-operators/nullish-expected-type.js";

export function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const mutationDiagnosticsStart = diagnostics.length;
  const mutation = tryPlanJsArrayLengthMutationExpression(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  if (mutation !== undefined || diagnostics.length > mutationDiagnosticsStart) {
    return mutation;
  }
  const typeTestStart = diagnostics.length;
  const typeTest = tryPlanTypeTestExpression(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  if (typeTest !== undefined || diagnostics.length > typeTestStart) {
    return typeTest;
  }
  const typeofStart = diagnostics.length;
  const typeofComparison = tryPlanTypeofComparisonExpression(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  if (typeofComparison !== undefined || diagnostics.length > typeofStart) {
    return typeofComparison;
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    sourceOperator === "=" &&
    expression?.Left !== undefined &&
    expression.Right !== undefined
  ) {
    const compatAssignment = tryPlanCompatAnyAssignment(
      node,
      expression.Left,
      expression.Right,
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
    if (compatAssignment.handled) {
      return compatAssignment.expression;
    }
  }
  if (
    sourceOperator !== undefined &&
    sourceOperator !== "=" &&
    expression?.Left !== undefined &&
    expression.Right !== undefined
  ) {
    const compat = selectCsharpCompatAnyBinaryOperation(
      input,
      expression.Left,
      expression.Right,
      sourceFile,
      sourceOperator,
    );
    if (compat.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
      return undefined;
    }
    if (compat.kind === "resolved") {
      const left = planExpression(
        expression.Left,
        sourceFile,
        input,
        diagnostics,
      );
      const right = planExpression(
        expression.Right,
        sourceFile,
        input,
        diagnostics,
      );
      if (left === undefined || right === undefined) {
        return undefined;
      }
      return translateCsharpCompatInvocation(
        compat,
        undefined,
        [
          left,
          { kind: "LiteralExpression", value: sourceOperator },
          compat.lazyRight === true
            ? {
                kind: "LambdaExpression",
                parameters: [],
                body: right,
              }
            : right,
        ],
      );
    }
  }
  const selection = selectCsharpBinaryOperation(input, node, sourceFile);
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  if (selection.targetOperation.kind === "nullish-test") {
    const operandNode = selection.targetOperation.operand === "left"
      ? selection.left
      : selection.right;
    const operand = planExpression(
      operandNode,
      sourceFile,
      input,
      diagnostics,
    );
    return operand === undefined
      ? undefined
      : {
          kind: "NullPatternExpression",
          expression: operand,
          negated: selection.targetOperation.negated,
        };
  }
  const targetOperator = selection.targetOperation.operator;
  const assignmentToken = csharpAssignmentOperatorTokenFromText(
    targetOperator,
  );
  if (assignmentToken !== undefined) {
    const left = planExpression(
      selection.left,
      sourceFile,
      input,
      diagnostics,
    );
    const expectedRightType = csharpTypeFromTargetTypeRef(selection.leftType);
    const right = sourceOperator === "=" && expectedRightType !== undefined
      ? planExpressionWithExpectedType(
          selection.right,
          sourceFile,
          input,
          diagnostics,
          expectedRightType,
          undefined,
          selection.leftType,
        )
      : planExpression(
          selection.right,
          sourceFile,
          input,
          diagnostics,
        );
    return left === undefined || right === undefined
      ? undefined
      : {
          kind: "AssignmentExpression",
          left,
          operatorToken: assignmentToken,
          right,
  };
}

function tryPlanCompatAnyAssignment(
  node: Node,
  left: Node,
  right: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): {
  readonly handled: boolean;
  readonly expression?: CsharpExpression;
} {
  if (input.ast.is.IsPropertyAccessExpression(left)) {
    const property = input.ast.as.AsPropertyAccessExpression(left);
    const receiverNode = property?.Expression;
    const selection = selectCsharpCompatAnyReceiverOperation(
      input,
      receiverNode,
      sourceFile,
      "property-write",
      property?.QuestionDotToken !== undefined,
    );
    if (selection.kind === "not-any") {
      return { handled: false };
    }
    if (selection.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
      return { handled: true };
    }
    const nameNode = property?.name;
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const value = planExpression(right, sourceFile, input, diagnostics);
    if (nameNode === undefined || receiver === undefined || value === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility property write requires an exact receiver, property name, and value.",
      ));
      return { handled: true };
    }
    return {
      handled: true,
      expression: translateCsharpCompatInvocation(
        selection,
        receiver,
        [
          { kind: "LiteralExpression", value: input.ast.text(nameNode) },
          value,
        ],
      ),
    };
  }
  if (input.ast.is.IsElementAccessExpression(left)) {
    const element = input.ast.as.AsElementAccessExpression(left);
    const receiverNode = element?.Expression;
    const argumentNode = element?.ArgumentExpression;
    const selection = selectCsharpCompatAnyReceiverOperation(
      input,
      receiverNode,
      sourceFile,
      "element-write",
      element?.QuestionDotToken !== undefined,
    );
    if (selection.kind === "not-any") {
      return { handled: false };
    }
    if (selection.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
      return { handled: true };
    }
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const argument = argumentNode === undefined
      ? undefined
      : planExpression(argumentNode, sourceFile, input, diagnostics);
    const value = planExpression(right, sourceFile, input, diagnostics);
    if (
      receiver === undefined ||
      argument === undefined ||
      value === undefined
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility element write requires an exact receiver, key, and value.",
      ));
      return { handled: true };
    }
    return {
      handled: true,
      expression: translateCsharpCompatInvocation(
        selection,
        receiver,
        [argument, value],
      ),
    };
  }
  return { handled: false };
}
  const binaryToken = csharpBinaryOperatorTokenFromText(
    targetOperator,
  );
  if (binaryToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected C# operator '${targetOperator}' has no target AST token.`,
    ));
    return undefined;
  }
  const left = planBinaryOperand(
    selection.left,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  const right = planBinaryOperand(
    selection.right,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  return left === undefined || right === undefined
    ? undefined
    : {
        kind: "BinaryExpression",
        left,
        operatorToken: binaryToken,
        right,
      };
}
