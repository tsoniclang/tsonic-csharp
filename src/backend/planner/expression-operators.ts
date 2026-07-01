import {
  AsBinaryExpression,
  AsElementAccessExpression,
  HasSourceKind,
  KindBinaryExpression,
  KindElementAccessExpression,
  KindPropertyAccessExpression,
  Node_Expression,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  isDestructuringAssignmentExpression,
  pushMissingDestructuringAssignmentFactsDiagnostic,
} from "./destructuring-assignment.js";
import {
  tryPlanCompatRuntimeElementSet,
  tryPlanCompatRuntimeOperator,
  tryPlanCompatRuntimePropertySet,
} from "./compat-runtime-operations.js";
import {
  tryPlanJsArrayLengthMutationExpression,
} from "./expression-js-array-mutations.js";
import {
  combineOwnership,
} from "./expression-operators/ownership.js";
import {
  planBinaryOperand,
} from "./expression-operators/operands.js";

export {
  planTypeofExpression,
} from "./expression-typeof-operators.js";
export {
  tryPlanBinaryExpressionWithExpectedType,
} from "./expression-operators/nullish-expected-type.js";

export function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const expression = AsBinaryExpression(node)!;
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (SourceKind(input.ast, expression.OperatorToken) === "KindEqualsToken") {
    const propertyDiagnosticsStart = diagnostics.length;
    const compatRuntimePropertySet = tryPlanCompatRuntimePropertySet(node, getCompatRuntimePropertySetReceiver(left, input), right, sourceFile, input, diagnostics, planExpression);
    if (compatRuntimePropertySet !== undefined) {
      return compatRuntimePropertySet;
    }
    if (diagnostics.length > propertyDiagnosticsStart) {
      return undefined;
    }
    const compatRuntimeElementSetSource = getCompatRuntimeElementSetSource(left, input);
    const elementDiagnosticsStart = diagnostics.length;
    const compatRuntimeElementSet = tryPlanCompatRuntimeElementSet(node, compatRuntimeElementSetSource?.receiver, compatRuntimeElementSetSource?.argument, right, sourceFile, input, diagnostics, planExpression);
    if (compatRuntimeElementSet !== undefined) {
      return compatRuntimeElementSet;
    }
    if (diagnostics.length > elementDiagnosticsStart) {
      return undefined;
    }
    const jsArrayDiagnosticsStart = diagnostics.length;
    const jsArrayLengthMutation = tryPlanJsArrayLengthMutationExpression(node, sourceFile, input, diagnostics, planExpression);
    if (jsArrayLengthMutation !== undefined) {
      return jsArrayLengthMutation;
    }
    if (diagnostics.length > jsArrayDiagnosticsStart) {
      return undefined;
    }
  }
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  if (isDestructuringAssignmentExpression(node, input)) {
    pushMissingDestructuringAssignmentFactsDiagnostic(left ?? node, diagnostics);
    return undefined;
  }
  const typeTestDiagnosticsStart = diagnostics.length;
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeTest !== undefined) {
    return typeTest;
  }
  if (diagnostics.length > typeTestDiagnosticsStart) {
    return undefined;
  }
  const typeofDiagnosticsStart = diagnostics.length;
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
  if (diagnostics.length > typeofDiagnosticsStart) {
    return undefined;
  }
  if (selectedOperator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return undefined;
  }
  const compatRuntimeOperatorDiagnosticsStart = diagnostics.length;
  const compatRuntimeOperator = tryPlanCompatRuntimeOperator(node, left, right, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeOperator !== undefined) {
    return compatRuntimeOperator;
  }
  if (diagnostics.length > compatRuntimeOperatorDiagnosticsStart) {
    return undefined;
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# binary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return undefined;
  }
  const binaryOperatorToken = csharpBinaryOperatorTokenFromText(csharpOperator.operator);
  const assignmentOperatorToken = csharpAssignmentOperatorTokenFromText(csharpOperator.operator);
  if (binaryOperatorToken === undefined && assignmentOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  if (assignmentOperatorToken !== undefined) {
    const leftExpression = planExpression(left!, sourceFile, input, diagnostics);
    const rightExpression = planExpression(right!, sourceFile, input, diagnostics);
    if (leftExpression === undefined || rightExpression === undefined) {
      return undefined;
    }
    return {
      kind: "AssignmentExpression",
      left: leftExpression,
      operatorToken: assignmentOperatorToken,
      right: rightExpression,
    };
  }
  if (binaryOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  const leftExpression = planBinaryOperand(left!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression);
  const rightExpression = planBinaryOperand(right!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression);
  if (leftExpression === undefined || rightExpression === undefined) {
    return undefined;
  }
  return {
    kind: "BinaryExpression",
    left: leftExpression,
    operatorToken: binaryOperatorToken,
    right: rightExpression,
  };
}

function getCompatRuntimePropertySetReceiver(
  node: Node | undefined,
  input: TargetCompileInput,
): Node | undefined {
  return HasSourceKind(input.ast, node, KindPropertyAccessExpression)
    ? Node_Expression(node)
    : undefined;
}

function getCompatRuntimeElementSetSource(
  node: Node | undefined,
  input: TargetCompileInput,
): { readonly receiver: Node | undefined; readonly argument: Node | undefined } | undefined {
  if (!HasSourceKind(input.ast, node, KindElementAccessExpression)) {
    return undefined;
  }
  const elementAccess = AsElementAccessExpression(node)!;
  return {
    receiver: elementAccess.Expression,
    argument: elementAccess.ArgumentExpression,
  };
}
