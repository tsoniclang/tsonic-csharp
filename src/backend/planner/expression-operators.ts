import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpBinaryOperation,
} from "../../policy/operations/index.js";
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
  const selection = selectCsharpBinaryOperation(input, node, sourceFile);
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  const assignmentToken = csharpAssignmentOperatorTokenFromText(
    selection.targetOperator,
  );
  if (assignmentToken !== undefined) {
    const left = planExpression(
      selection.left,
      sourceFile,
      input,
      diagnostics,
    );
    const right = planExpression(
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
  const binaryToken = csharpBinaryOperatorTokenFromText(
    selection.targetOperator,
  );
  if (binaryToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected C# operator '${selection.targetOperator}' has no target AST token.`,
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
