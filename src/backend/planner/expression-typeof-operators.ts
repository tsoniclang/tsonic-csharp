import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpCompatTypeofOperation,
} from "../../policy/compat/index.js";
import {
  getCsharpTypeofRuntimeKind,
  selectCsharpTypeofComparison,
  sourceOperatorFromKindName,
} from "../../policy/operations/index.js";
import type {
  CsharpTypeofRuntimeKind,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  expressionToCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanRuntimeUnionTypeTest,
} from "./runtime-union-projections.js";
import {
  translateCsharpCompatInvocation,
} from "../../translate/expressions/compat.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.ast.is.IsTypeOfExpression(node)) {
    return undefined;
  }
  const operand = input.ast.as.AsTypeOfExpression(node)?.Expression;
  const compat = selectCsharpCompatTypeofOperation(
    input,
    operand,
    sourceFile,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const planned = operand === undefined
      ? undefined
      : planExpression(operand, sourceFile, input, diagnostics);
    return planned === undefined
      ? undefined
      : translateCsharpCompatInvocation(
          compat,
          undefined,
          [planned],
        );
  }
  const operandType = input.types.resolveNode(operand, sourceFile);
  const runtimeKind = getCsharpTypeofRuntimeKind(operandType);
  if (operand === undefined || runtimeKind === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# typeof translation requires one exact statically proven target runtime kind.",
    ));
    return undefined;
  }
  return { kind: "LiteralExpression", value: runtimeKind };
}

export function tryPlanTypeTestExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (
    !input.ast.is.IsBinaryExpression(node) ||
    sourceOperatorFromKindName(input.ast.operatorKindName(node)) !== "instanceof"
  ) {
    return undefined;
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const right = expression?.Right;
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Checked instanceof expression is missing an exact operand.",
    ));
    return undefined;
  }
  const planned = planExpression(left, sourceFile, input, diagnostics);
  return planned === undefined
    ? undefined
    : {
        kind: "IsPatternExpression",
        expression: planned,
        type: expressionToCsharpType(right, sourceFile, input, diagnostics),
      };
}

export function tryPlanTypeofComparisonExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    sourceOperator !== "===" &&
    sourceOperator !== "==" &&
    sourceOperator !== "!==" &&
    sourceOperator !== "!="
  ) {
    return undefined;
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const comparison = getTypeofComparison(
    expression?.Left,
    expression?.Right,
    input,
  ) ?? getTypeofComparison(
    expression?.Right,
    expression?.Left,
    input,
  );
  if (comparison === undefined) {
    return undefined;
  }
  const operandType = input.types.resolveNode(
    comparison.operand,
    sourceFile,
  );
  const negated = sourceOperator === "!==" || sourceOperator === "!=";
  const compat = selectCsharpCompatTypeofOperation(
    input,
    comparison.operand,
    sourceFile,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const planned = planExpression(
      comparison.operand,
      sourceFile,
      input,
      diagnostics,
    );
    const runtimeTypeof = planned === undefined
      ? undefined
      : translateCsharpCompatInvocation(compat, undefined, [planned]);
    return runtimeTypeof === undefined
      ? undefined
      : {
          kind: "BinaryExpression",
          left: runtimeTypeof,
          operatorToken: {
            kind: negated
              ? "ExclamationEqualsToken"
              : "EqualsEqualsToken",
          },
          right: {
            kind: "LiteralExpression",
            value: comparison.runtimeKind,
          },
        };
  }
  const selection = selectCsharpTypeofComparison(
    operandType,
    comparison.runtimeKind,
    negated,
  );
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  if (selection.kind === "constant") {
    return { kind: "LiteralExpression", value: selection.value };
  }
  const planned = planExpression(
    comparison.operand,
    sourceFile,
    input,
    diagnostics,
  );
  if (planned === undefined) {
    return undefined;
  }
  if (selection.kind === "runtime-union-arm-test") {
    return tryPlanRuntimeUnionTypeTest(
      comparison.operand,
      selection.targetType,
      sourceFile,
      input,
      diagnostics,
      planned,
      selection.negated,
    );
  }
  const targetType = csharpTypeFromTargetTypeRef(selection.targetType);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected nullable typeof comparison target type is not renderable in C#.",
    ));
    return undefined;
  }
  return {
    kind: "IsPatternExpression",
    expression: planned,
    type: targetType,
    negated: selection.negated,
  };
}

function getTypeofComparison(
  typeofNode: Node | undefined,
  literalNode: Node | undefined,
  input: CsharpTranslationContext,
): {
  readonly operand: Node;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
} | undefined {
  if (
    typeofNode === undefined ||
    literalNode === undefined ||
    !input.ast.is.IsTypeOfExpression(typeofNode) ||
    !input.ast.is.IsStringLiteral(literalNode)
  ) {
    return undefined;
  }
  const operand = input.ast.as.AsTypeOfExpression(typeofNode)?.Expression;
  const runtimeKind = runtimeKindLiteral(input.ast.text(literalNode));
  return operand === undefined || runtimeKind === undefined
    ? undefined
    : { operand, runtimeKind };
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
