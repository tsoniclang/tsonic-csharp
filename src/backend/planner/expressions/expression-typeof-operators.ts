import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { getCsharpClassFactory } from "../../../target-model/types/class-factories.js";
import {
  sourceOperatorFromKindName,
} from "../../../target-model/syntax/operators.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import { createDestructuringPlannerState, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { planCsharpRuntimeCategory } from "./runtime-category.js";
import { evaluatedConstant } from "./csharp-expression-builders.js";
import { planCsharpClosedTypeTest } from "./type-tests.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (!input.program.source.ast.is.IsTypeOfExpression(node)) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsTypeOfExpression(node)?.Expression;
  const jsValueOperation = operand === undefined
    ? undefined
    : input.program.operations.jsTypeof(operand);
  if (jsValueOperation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a typeof expression without a sealed operation classification.",
    ));
    return undefined;
  }
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
          input.scope.typeParameterNames,
          jsValueOperation,
          undefined,
          [planned],
        );
  }
  const runtimeKind = operand === undefined
    ? undefined
    : input.program.operations.typeofRuntimeKind(operand);
  if (operand === undefined || runtimeKind === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# typeof translation requires one exact statically proven target runtime kind.",
    ));
    return undefined;
  }
  const carrier = input.types.classifications.resolveNode(operand, sourceFile);
  const expression = planExpression(operand, sourceFile, input, diagnostics);
  const result = carrier === undefined || expression === undefined ? undefined : planCsharpRuntimeCategory(
    expression, carrier, runtimeKind, input, state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast),
  );
  if (result === undefined) diagnostics.push(unsupportedNodeDiagnostic(node,
    "C# typeof translation requires a runtime category consistent with its sealed native carrier."));
  return result;
}

export function tryPlanTypeTestExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state?: DestructuringPlannerState,
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
  const planned = planExpression(left, sourceFile, input, diagnostics, state);
  const factoryType = input.program.operations.binary(node)?.instanceFactory;
  const factory = getCsharpClassFactory(factoryType);
  if (factory !== undefined) {
    const retained = input.program.classFactories.get(factory.declaration);
    const receiver = planExpression(right, sourceFile, input, diagnostics);
    const owner = factoryType === undefined ? undefined : csharpTypeFromTargetTypeRef(factoryType, input.scope.typeParameterNames);
    if (!retained?.requiresInstanceTest || planned === undefined || receiver === undefined || owner === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A local class identity test requires its sealed per-evaluation environment."));
      return undefined;
    }
    return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner,
      name: factory.instanceTestMethodName }, arguments: [
      { kind: "Argument", expression: planned }, { kind: "Argument", expression: receiver },
    ] };
  }
  const fact = input.program.operations.binary(node)?.instanceTest;
  const sourceCarrier = input.types.classifications.resolveNode(left, sourceFile);
  const result = planned === undefined || fact === undefined || sourceCarrier === undefined ||
    !targetTypeRefEquals(fact.sourceCarrier, sourceCarrier) ? undefined
    : planCsharpClosedTypeTest(planned, fact, input, state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast));
  if (result === undefined) diagnostics.push(unsupportedNodeDiagnostic(node,
    "Nominal type test requires its exact sealed source, constructor and native payload test."));
  return result;
}

export function tryPlanTypeofComparisonExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state?: DestructuringPlannerState,
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
  const comparison = input.program.operations.binary(node)?.typeofComparison;
  if (comparison === undefined) {
    return undefined;
  }
  const negated = sourceOperator === "!==" || sourceOperator === "!=";
  const jsValueOperation = input.program.operations.jsTypeof(
    comparison.operand,
  );
  if (jsValueOperation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a typeof comparison without a sealed operation classification.",
    ));
    return undefined;
  }
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
      : translateCsharpJsValueInvocation(input.scope.typeParameterNames, jsValueOperation, undefined, [planned]);
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
  const selection = comparison.selection;
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
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
  if (selection.kind === "constant") return evaluatedConstant(planned, selection.value);
  const sourceCarrier = input.types.classifications.resolveNode(comparison.operand, sourceFile);
  const result = sourceCarrier === undefined || !targetTypeRefEquals(sourceCarrier, selection.sourceCarrier)
    ? undefined : planCsharpRuntimeCategory(planned, sourceCarrier, selection.category, input,
      state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast), selection);
  if (result === undefined) diagnostics.push(unsupportedNodeDiagnostic(node,
    "The selected typeof comparison must retain its exact native carrier and closed category contract."));
  return result;
}
