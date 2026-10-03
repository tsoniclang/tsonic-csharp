import { selectedPolicyDiagnostic, targetPolicyDiagnostic, unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { planCsharpJsValueCall } from "./js-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "../../planned-value-composition.js";
import type { CsharpPlannedValue } from "../../planned-values.js";
import { translateSelectedTargetCall } from "./target.js";
import { translateSourceOwnedCall } from "./source.js";
import { planCsharpOptionalReceiverChain } from "./optional-chain.js";
import { planCsharpClosedTypeTest } from "../../type-tests.js";
import { createDestructuringPlannerState } from "../../../bindings/binding-state.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planCsharpSelectedSourceCallResult } from "./results.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateCsharpCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  const optional = planCsharpOptionalReceiverChain(
    node, sourceFile, input, diagnostics, planExpression, planCallArgument,
    (call, context, expressions, arguments_) => translateCsharpCallExpressionCore(
      call, sourceFile, context, diagnostics, expressions, arguments_,
    ),
  );
  return optional.handled ? optional.expression : translateCsharpCallExpressionCore(
    node, sourceFile, input, diagnostics, planExpression, planCallArgument,
  );
}

function translateCsharpCallExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  const classification = input.program.operations.call(node);
  if (classification === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_CALL_CLASSIFICATION_MISSING",
      "C# planning received a call without a sealed target classification.",
    ));
    return undefined;
  }
  const sourceCall = classification.source;
  if (classification.typeTest !== undefined) {
    const fact = classification.typeTest;
    const argument = sourceCall?.sourceArguments[0];
    const carrier = argument === undefined ? undefined : input.types.classifications.resolveNode(argument.expression, sourceFile);
    const targetType = csharpTypeFromTargetTypeRef(fact.sourceCarrier, input.scope.typeParameterNames);
    const value = sourceCall?.sourceArguments.length !== 1 || argument === undefined || carrier === undefined ||
      targetType === undefined || !targetTypeRefEquals(carrier, fact.sourceCarrier) ? undefined
      : planCallArgument(argument.expression, sourceFile, input, diagnostics, targetType, undefined, fact.sourceCarrier);
    const result = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
      selected => planCsharpClosedTypeTest(selected, fact, input,
        createDestructuringPlannerState(sourceFile, input.program.source.ast)));
    if (result === undefined) diagnostics.push(targetPolicyDiagnostic(node, "CSHARP_CLOSED_TYPE_TEST_INVALID",
      "Array predicate requires its exact sealed native argument and payload test."));
    return result;
  }
  const sourceFlow = classification.sourceFlow;
  if (sourceFlow.kind === "keep-alive") {
    const value = planExpression(sourceFlow.valueExpression, sourceFile, input, diagnostics);
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [value], values => ({
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "AliasQualifiedName", alias: "global", name: {
          kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "GC",
        },
      }, name: "KeepAlive" },
      arguments: [{ kind: "Argument", expression: values[0]! }],
    }));
  }
  if (sourceFlow.kind === "rejected") {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      sourceFlow.code,
      sourceFlow.reason,
    ));
    return undefined;
  }
  const jsValueOperation = classification.jsValue;
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    return planCsharpJsValueCall(node, sourceFile, input, diagnostics, jsValueOperation, sourceCall, planExpression);
  }
  const selection = classification.target;
  if (selection === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_CALL_CLASSIFICATION_INCOMPLETE",
      "The sealed C# call classification selected neither a JS-value operation nor a target call.",
    ));
    return undefined;
  }
  switch (selection.kind) {
    case "resolved": {
      const invocation = translateSelectedTargetCall(
        node,
        selection.source,
        selection.call,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
      return invocation === undefined || classification.sourceResult === undefined ? invocation
        : planCsharpSelectedSourceCallResult(node, sourceFile, input, diagnostics, classification.sourceResult, invocation);
    }
    case "source-owned":
      return translateSourceOwnedCall(
        node,
        selection.source,
        classification,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}
