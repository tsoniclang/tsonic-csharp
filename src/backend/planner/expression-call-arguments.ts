import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type { CsharpTargetParameter } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  isAstNode,
  HasSourceKind,
  KindArrowFunction,
  KindFunctionExpression,
} from "./source-ast.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import {
  selectCsharpSourceArgument,
} from "../../policy/members/argument-selection.js";

export function planCallArgumentCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  expectedArgumentPassingMode: CsharpTargetParameter["passingMode"] = "by-value",
  state?: DestructuringPlannerState,
  selectedTargetParameter?: CsharpTargetParameter,
): CsharpArgument | undefined {
  const selected = selectCsharpSourceArgument(input.sourceFacts, node);
  if (selected.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selected.reason));
    return undefined;
  }
  const argument = selected.argument;
  if (!csharpSupportsArgumentPassingMode(argument.passingMode)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${argument.passingMode}'.`));
    return undefined;
  }
  if (argument.passingMode !== expectedArgumentPassingMode) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Finalized argument-passing fact '${argument.passingMode}' does not match the selected call parameter mode '${expectedArgumentPassingMode}'.`));
    return undefined;
  }
  if (
    selectedTargetParameter?.csharpOutputMayBeNull === true &&
    (
      argument.passingMode === "by-value" ||
      argument.passingMode === "byref-readonly"
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected target parameter '${selectedTargetParameter.name}' declares nullable output on non-writing passing mode '${argument.passingMode}'.`,
    ));
    return undefined;
  }
  if (!isAstNode(input.ast, argument.storageExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry exact source storage expressions before C# argument emission."));
    return undefined;
  }
  if (selectedTargetParameter?.csharpOutputMayBeNull === true) {
    const requirement = input.artifacts.requireStorage(
      argument.storageExpression,
      {
        kind: "nullable-reference-write",
        writtenType: selectedTargetParameter.type,
      },
    );
    if (requirement.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        requirement.reason,
      ));
      return undefined;
    }
  }
  const passing = getCsharpArgumentPassing(argument.passingMode, node, diagnostics);
  if (argument.passingMode !== "by-value" && passing === undefined) {
    return undefined;
  }
  const expression = argument.passingMode === "by-value"
    ? planCallArgumentExpression(
        argument.storageExpression,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planExpressionWithExpectedType,
        expectedType,
        expectedTypeSubject,
        conversionExpectedTargetType,
        state,
      )
    : planExpression(
        argument.storageExpression,
        sourceFile,
        input,
        diagnostics,
        state,
      );
  if (expression === undefined) {
    return undefined;
  }
  return {
    kind: "Argument",
    expression,
    ...(passing !== undefined ? { passing } : {}),
  };
}

function planCallArgumentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (expectedType !== undefined && conversionExpectedTargetType !== undefined) {
    if (HasSourceKind(input.ast, node, KindArrowFunction)) {
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression, expectedType, state, conversionExpectedTargetType, planExpressionWithExpectedType);
    }
    if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
      return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, state, conversionExpectedTargetType);
    }
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
  }
  return planExpression(node, sourceFile, input, diagnostics, state);
}

function csharpSupportsArgumentPassingMode(
  mode: CsharpTargetParameter["passingMode"],
): boolean {
  switch (mode) {
    case "by-value":
    case "byref-writeonly-must-init":
    case "byref-readwrite":
    case "byref-readonly":
      return true;
    case "borrow-shared":
    case "borrow-mut":
    case "move":
      return false;
  }
}

function getCsharpArgumentPassing(
  mode: CsharpTargetParameter["passingMode"],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpArgument["passing"] {
  switch (mode) {
    case "by-value":
      return undefined;
    case "byref-writeonly-must-init":
      return "out";
    case "byref-readwrite":
      return "ref";
    case "byref-readonly":
      return "in";
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${mode}'.`));
      return undefined;
  }
}
