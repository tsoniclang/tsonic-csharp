import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpResolvedBinaryOperation,
} from "../../../../analysis/operations/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "../csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  planBinaryOperand,
} from "./operands.js";
import {
  callStatic,
  literalNumber,
} from "../csharp-expression-builders.js";
import { isCsharpRuntimeUndefinedTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { planCsharpBigIntCall } from "./bigint-call.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";

export function planSelectedCsharpBinaryOperation(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (selection.targetOperation.kind === "bigint-call") {
    return planCsharpBigIntCall(node, selection, sourceFile, input, diagnostics, planExpression, state);
  }
  if (selection.targetOperation.kind === "array-index-presence") {
    const left = planExpression(selection.left, sourceFile, input, diagnostics);
    const right = planExpression(selection.right, sourceFile, input, diagnostics);
    return left === undefined || right === undefined ? undefined : callStatic(
      { kind: "IdentifierName", requiredUsingNamespace: "Tsonic.CSharp.Js", name: "ArrayLike" },
      "HasIndex", [left, right],
    );
  }
  if (selection.targetOperation.kind === "nullish-equality") {
    const operands = [
      { node: selection.left, type: selection.leftInputType },
      { node: selection.right, type: selection.rightInputType },
    ].map(({ node: operand, type }) => {
      const syntaxType = csharpTypeFromTargetTypeRef(type);
      return syntaxType === undefined ? undefined : planExpressionWithExpectedType(
        operand, sourceFile, input, diagnostics, syntaxType, undefined, type,
      );
    });
    const [left, right] = operands;
    if (left === undefined || right === undefined) return undefined;
    return {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "TupleExpression", elements: [left, right,
        { kind: "LiteralExpression", value: selection.targetOperation.value }] },
      name: "Item3",
    };
  }
  if (selection.targetOperation.kind === "nullish-test") {
    const operandNode = selection.targetOperation.operand === "left"
      ? selection.left
      : selection.right;
    const operand = planExpression(
      operandNode,
      sourceFile,
      { ...input, storageExpression: operandNode },
      diagnostics,
    );
    if (operand === undefined) return undefined;
    const otherNode = selection.targetOperation.operand === "left" ? selection.right : selection.left;
    const other = planExpression(otherNode, sourceFile, input, diagnostics);
    if (other === undefined) return undefined;
    let tested = operand;
    const intrinsicUndefined = input.program.source.ast.is.IsIdentifier(otherNode) &&
      input.program.sourceNavigation.referenceFor(otherNode) === undefined &&
      isCsharpRuntimeUndefinedTargetType(input.program.sourceEvidence.nodeTargetType(otherNode));
    if (other.kind !== "LiteralExpression" && !intrinsicUndefined) {
      const testedType = csharpTypeFromTargetTypeRef(selection.targetOperation.operand === "left"
        ? selection.leftType : selection.rightType);
      const otherType = csharpTypeFromTargetTypeRef(selection.targetOperation.operand === "left"
        ? selection.rightType : selection.leftType);
      if (testedType === undefined || otherType === undefined) return undefined;
      const testedValue: CsharpExpression = { kind: "CastExpression", type: testedType, expression: operand };
      const otherValue: CsharpExpression = { kind: "CastExpression", type: otherType, expression: other };
      tested = { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "TupleExpression", elements: selection.targetOperation.operand === "left"
          ? [testedValue, otherValue] : [otherValue, testedValue] },
        name: selection.targetOperation.operand === "left" ? "Item1" : "Item2" };
    }
    return { kind: "NullPatternExpression", expression: tested, negated: selection.targetOperation.negated };
  }
  if (selection.targetOperation.kind === "string-ordinal-relational") {
    const operatorToken = csharpBinaryOperatorTokenFromText(
      selection.targetOperation.operator,
    );
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
    if (operatorToken === undefined || left === undefined || right === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected C# string relational operator '${selection.targetOperation.operator}' could not be planned exactly.`,
      ));
      return undefined;
    }
    return {
      kind: "BinaryExpression",
      left: callStatic(
        { kind: "PredefinedType", name: "string" },
        "CompareOrdinal",
        [left, right],
      ),
      operatorToken,
      right: literalNumber(0),
    };
  }
  if (selection.targetOperation.kind === "reference-identity") {
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
    if (left === undefined || right === undefined) {
      return undefined;
    }
    const comparison = callStatic(
      { kind: "PredefinedType", name: "object" },
      "ReferenceEquals",
      [left, right],
    );
    return selection.targetOperation.negated
      ? {
          kind: "PrefixUnaryExpression",
          operatorToken: { kind: "ExclamationToken" },
          operand: comparison,
        }
      : comparison;
  }
  const targetOperator = selection.targetOperation.operator;
  const assignmentToken = csharpAssignmentOperatorTokenFromText(
    targetOperator,
  );
  if (assignmentToken !== undefined) {
    let storageExpression = selection.left;
    while (input.program.source.ast.is.IsParenthesizedExpression(storageExpression)) {
      const inner = input.program.source.ast.as.AsParenthesizedExpression(storageExpression)?.Expression;
      if (inner === undefined) return undefined;
      storageExpression = inner;
    }
    const left = planExpression(
      selection.left,
      sourceFile,
      { ...input, storageExpression },
      diagnostics,
    );
    const expectedRightType = csharpTypeFromTargetTypeRef(selection.leftType);
    const right = selection.sourceOperator === "=" && expectedRightType !== undefined
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
  const binaryToken = csharpBinaryOperatorTokenFromText(targetOperator);
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
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.leftInputType),
    selection.leftInputType,
  );
  const right = planBinaryOperand(
    selection.right,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.rightInputType),
    selection.rightInputType,
  );
  if (left !== undefined && right !== undefined && input.program.numericRepresentations.usesInt32Remainder(node)) {
    const integer = csharpTypeFromTargetTypeRef({ kind: "source-primitive", name: "int32" })!;
    const number = csharpTypeFromTargetTypeRef({ kind: "source-primitive", name: "float64" })!;
    return {
      kind: "CastExpression",
      type: number,
      expression: {
        kind: "ParenthesizedExpression",
        expression: {
          kind: "BinaryExpression",
          left: { kind: "CastExpression", type: integer, expression: { kind: "ParenthesizedExpression", expression: left } },
          operatorToken: binaryToken,
          right: { kind: "CastExpression", type: integer, expression: { kind: "ParenthesizedExpression", expression: right } },
        },
      },
    };
  }
  return left === undefined || right === undefined
    ? undefined
    : {
        kind: "BinaryExpression",
        left,
        operatorToken: binaryToken,
        right,
      };
}
