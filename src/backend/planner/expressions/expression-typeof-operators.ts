import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpJsTypeofOperation,
} from "../../../policy/js-value-operations/index.js";
import {
  getCsharpTypeofRuntimeKind,
  selectCsharpTypeofComparison,
  sourceOperatorFromKindName,
} from "../../../policy/operations/index.js";
import type {
  CsharpTypeofRuntimeKind,
} from "../../../policy/types/index.js";
import {
  csharpTsValueTargetType,
  isCsharpJsValueTargetType,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  expressionToCsharpType,
} from "../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanRuntimeUnionTypeTest,
} from "./runtime-union-projections.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.program.source.ast.is.IsTypeOfExpression(node)) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsTypeOfExpression(node)?.Expression;
  const jsValueOperation = selectCsharpJsTypeofOperation(
    input.policy,
    operand,
    sourceFile,
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const planned = operand === undefined
      ? undefined
      : planExpression(operand, sourceFile, input, diagnostics);
    return planned === undefined
      ? undefined
      : translateCsharpJsValueInvocation(
          jsValueOperation,
          undefined,
          [planned],
        );
  }
  const operandType = input.types.policy.resolveNode(operand, sourceFile);
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (
    !input.program.source.ast.is.IsBinaryExpression(node) ||
    sourceOperatorFromKindName(input.program.source.ast.operatorKindName(node)) !== "instanceof"
  ) {
    return undefined;
  }
  const expression = input.program.source.ast.as.AsBinaryExpression(node);
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
  const targetType = expressionToCsharpType(right, sourceFile, input, diagnostics);
  if (planned === undefined || targetType === undefined) {
    return undefined;
  }
  if (isCsharpJsValueTargetType(input.types.policy.resolveNode(left, sourceFile))) {
    const runtimeType = csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
    return runtimeType === undefined
      ? undefined
      : {
          kind: "InvocationExpression",
          callee: {
            kind: "SimpleMemberAccessExpression",
            receiver: runtimeType,
            name: "IsDynamicInstanceOf",
            typeArguments: [targetType],
          },
          arguments: [{ kind: "Argument", expression: planned }],
        };
  }
  return {
    kind: "IsPatternExpression",
    expression: planned,
    type: targetType,
  };
}

export function tryPlanTypeofComparisonExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.program.source.ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const sourceOperator = sourceOperatorFromKindName(
    input.program.source.ast.operatorKindName(node),
  );
  if (
    sourceOperator !== "===" &&
    sourceOperator !== "==" &&
    sourceOperator !== "!==" &&
    sourceOperator !== "!="
  ) {
    return undefined;
  }
  const expression = input.program.source.ast.as.AsBinaryExpression(node);
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
  const operandType = input.types.policy.resolveNode(
    comparison.operand,
    sourceFile,
  );
  const negated = sourceOperator === "!==" || sourceOperator === "!=";
  const jsValueOperation = selectCsharpJsTypeofOperation(
    input.policy,
    comparison.operand,
    sourceFile,
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const planned = planExpression(
      comparison.operand,
      sourceFile,
      input,
      diagnostics,
    );
    const runtimeTypeof = planned === undefined
      ? undefined
      : translateCsharpJsValueInvocation(jsValueOperation, undefined, [planned]);
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
  input: CsharpPlanningContext,
): {
  readonly operand: Node;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
} | undefined {
  if (
    typeofNode === undefined ||
    literalNode === undefined ||
    !input.program.source.ast.is.IsTypeOfExpression(typeofNode) ||
    !input.program.source.ast.is.IsStringLiteral(literalNode)
  ) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsTypeOfExpression(typeofNode)?.Expression;
  const runtimeKind = runtimeKindLiteral(input.program.source.ast.text(literalNode));
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
