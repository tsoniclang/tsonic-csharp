import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpBinaryOperation,
  sourceOperatorFromKindName,
} from "../../../policy/operations/index.js";
import {
  selectCsharpJsValueBinaryOperation,
  selectCsharpJsValueReceiverExpressionOperation,
  selectCsharpJsValueReceiverOperation,
} from "../../../policy/js-value-operations/index.js";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../../policy/members/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  csharpAssignmentOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanJsArrayLengthMutationExpression,
} from "./expression-js-array-mutations.js";
import {
  planSelectedCsharpBinaryOperation,
} from "./operators/selected-binary.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";
import {
  HasSourceKind,
  KindBinaryExpression,
} from "@tsonic/target-api/source";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

export {
  planTypeofExpression,
} from "./expression-typeof-operators.js";
export {
  tryPlanBinaryExpressionWithExpectedType,
} from "./operators/nullish-expected-type.js";

export function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  const expression = input.ast.as.AsBinaryExpression(node);
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
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
  if (
    sourceOperator !== undefined &&
    sourceOperator !== "=" &&
    expression?.Left !== undefined &&
    expression.Right !== undefined
  ) {
    const jsValueOperation = selectCsharpJsValueBinaryOperation(
      input,
      expression.Left,
      expression.Right,
      sourceFile,
      sourceOperator,
    );
    if (jsValueOperation.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
      return undefined;
    }
    if (jsValueOperation.kind === "resolved") {
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
      return translateCsharpJsValueInvocation(
        jsValueOperation,
        undefined,
        [
          left,
          { kind: "LiteralExpression", value: sourceOperator },
          jsValueOperation.lazyRight === true
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
  if (
    sourceOperator !== undefined &&
    csharpAssignmentOperatorTokenFromText(sourceOperator) !== undefined &&
    expression?.Left !== undefined &&
    expression.Right !== undefined
  ) {
    const jsValueAssignment = tryPlanJsValueAssignment(
      node,
      expression.Left,
      expression.Right,
      sourceOperator,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planExpressionWithExpectedType,
    );
    if (jsValueAssignment.handled) {
      return jsValueAssignment.expression;
    }
  }
  const selection = selectCsharpBinaryOperation(input, node, sourceFile);
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  return planSelectedCsharpBinaryOperation(
    node,
    selection,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
  );
}

function tryPlanJsValueAssignment(
  node: Node,
  left: Node,
  right: Node,
  sourceOperator: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): {
  readonly handled: boolean;
  readonly expression?: CsharpExpression;
} {
  if (input.ast.is.IsPropertyAccessExpression(left)) {
    const property = input.ast.as.AsPropertyAccessExpression(left);
    const receiverNode = property?.Expression;
    const targetProperty = selectCsharpTargetProperty(input, left, sourceFile);
    if (
      targetProperty.kind === "source-owned" &&
      receiverNode !== undefined
    ) {
      const jsValueProperty = resolveCsharpJsValueObjectShapeProperty(
        input.objectShapes,
        input.semantics(sourceFile),
        targetProperty,
        sourceFile,
      );
      if (jsValueProperty.kind === "rejected") {
        diagnostics.push(unsupportedNodeDiagnostic(left, jsValueProperty.reason));
        return { handled: true };
      }
      if (jsValueProperty.kind === "resolved") {
        if (sourceOperator !== "=") {
          diagnostics.push(unsupportedNodeDiagnostic(
            node,
            `Closed JS-value object-shape assignment '${sourceOperator}' requires an exact read-modify-write runtime operation.`,
          ));
          return { handled: true };
        }
        const selection = selectCsharpJsValueReceiverOperation(
          jsValueProperty.shape.targetType,
          "property-write",
          property?.QuestionDotToken !== undefined,
        );
        if (selection.kind !== "resolved") {
          diagnostics.push(unsupportedNodeDiagnostic(
            left,
            selection.kind === "rejected"
              ? selection.reason
              : "The exact JS-value object-shape property has no closed write operation.",
          ));
          return { handled: true };
        }
        const receiver = planExpression(
          receiverNode,
          sourceFile,
          input,
          diagnostics,
        );
        const memberType = csharpTypeFromTargetTypeRef(
          jsValueProperty.member.type,
        );
        const value = memberType === undefined
          ? undefined
          : planExpressionWithExpectedType(
              right,
              sourceFile,
              input,
              diagnostics,
              memberType,
              undefined,
              jsValueProperty.member.type,
            );
        if (receiver === undefined || value === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(
            node,
            "A C# JS-value object-shape property write requires an exact receiver and closed value conversion.",
          ));
          return { handled: true };
        }
        return {
          handled: true,
          expression: translateCsharpJsValueInvocation(
            selection,
            receiver,
            [
              {
                kind: "LiteralExpression",
                value: jsValueProperty.member.sourceName,
              },
              value,
            ],
          ),
        };
      }
    }
    if (sourceOperator !== "=") {
      return { handled: false };
    }
    const selection = selectCsharpJsValueReceiverExpressionOperation(
      input,
      receiverNode,
      sourceFile,
      "property-write",
      property?.QuestionDotToken !== undefined,
    );
    if (selection.kind === "not-js-value") {
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
        "A JS-value property write requires an exact receiver, property name, and value.",
      ));
      return { handled: true };
    }
    return {
      handled: true,
      expression: translateCsharpJsValueInvocation(
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
    const selection = selectCsharpJsValueReceiverExpressionOperation(
      input,
      receiverNode,
      sourceFile,
      "element-write",
      element?.QuestionDotToken !== undefined,
    );
    if (selection.kind === "not-js-value") {
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
        "A JS-value element write requires an exact receiver, key, and value.",
      ));
      return { handled: true };
    }
    return {
      handled: true,
      expression: translateCsharpJsValueInvocation(
        selection,
        receiver,
        [argument, value],
      ),
    };
  }
  return { handled: false };
}
