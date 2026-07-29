import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  getCsharpRuntimeUnionArms,
} from "../../policy/types/index.js";
import {
  getCsharpTypeofRuntimeKind,
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
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanRuntimeUnionTypeTest,
} from "./runtime-union-projections.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (!input.ast.is.IsTypeOfExpression(node)) {
    return undefined;
  }
  const operand = input.ast.as.AsTypeOfExpression(node)?.Expression;
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
  const exactRuntimeKind = getCsharpTypeofRuntimeKind(operandType);
  if (exactRuntimeKind !== undefined) {
    return {
      kind: "LiteralExpression",
      value: (exactRuntimeKind === comparison.runtimeKind) !== negated,
    };
  }
  const matchingArms = (getCsharpRuntimeUnionArms(operandType) ?? [])
    .filter((arm) =>
      getCsharpTypeofRuntimeKind(arm) === comparison.runtimeKind);
  if (matchingArms.length !== 1) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      matchingArms.length === 0
        ? "The selected typeof comparison has no target runtime-kind representation."
        : "The selected typeof comparison needs a single-evaluation multi-arm runtime-union condition plan.",
    ));
    return undefined;
  }
  const planned = planExpression(
    comparison.operand,
    sourceFile,
    input,
    diagnostics,
  );
  return planned === undefined
    ? undefined
    : tryPlanRuntimeUnionTypeTest(
        comparison.operand,
        matchingArms[0]!,
        sourceFile,
        input,
        diagnostics,
        planned,
        negated,
      );
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
