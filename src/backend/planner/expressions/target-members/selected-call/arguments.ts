import { applyCsharpConversionSelection } from "../../conversions.js";
import {
  csharpTargetParameterValueType,
  getCsharpDelegateSignature,
  getCsharpJsArrayElementTargetType,
  targetTypeRefEquals,
} from "../../../../../target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { targetArgumentOrderIsRepresentable } from "./helpers.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type {
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  CsharpProviderArgumentMapping,
  ResolvedSourceCallInfo,
} from "../../../../../analysis/operations/index.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetParameter } from "../../../../../target-model/types/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateSelectedTargetArguments(
  node: Node,
  source: ResolvedSourceCallInfo,
  selection: CsharpSelectedTargetCall,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const planned: {
    readonly parameterIndex: number;
    readonly effectiveArgumentIndex: number;
    readonly argument: CsharpArgument;
  }[] = [];
  if (selection.receiver.kind === "target-parameter") {
    const receiver = source.sourceReceiver?.expression;
    const parameter = selection.targetMember.parameters[
      selection.receiver.targetParameterIndex
    ];
    if (receiver === undefined || parameter === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected first-argument target receiver has no exact source receiver or target parameter.",
      ));
      return undefined;
    }
    const argument = translateCallArgument(
      receiver,
      parameter,
      "value",
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
    );
    if (argument === undefined) {
      return undefined;
    }
    planned.push({
      parameterIndex: selection.receiver.targetParameterIndex,
      effectiveArgumentIndex: -1,
      argument,
    });
  }
  for (const argumentSelection of selection.arguments) {
    const sourceArgument = source.sourceArguments[
      argumentSelection.sourceArgumentIndex
    ]?.expression;
    if (sourceArgument === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected target argument ${argumentSelection.effectiveArgumentIndex} has no exact checker-owned source expression.`,
      ));
      return undefined;
    }
    const argument = translateCallArgument(
      sourceArgument,
      argumentSelection.targetParameter,
      argumentSelection.sourceForm,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
      selection.origin === "provider"
        ? selection.argumentMappings.find((mapping) =>
            mapping.effectiveArgumentIndex ===
              argumentSelection.effectiveArgumentIndex)
        : undefined,
    );
    if (argument === undefined) {
      return undefined;
    }
    planned.push({
      parameterIndex: argumentSelection.targetParameterIndex,
      effectiveArgumentIndex: argumentSelection.effectiveArgumentIndex,
      argument,
    });
  }
  planned.sort((left, right) =>
    left.parameterIndex - right.parameterIndex ||
    left.effectiveArgumentIndex - right.effectiveArgumentIndex);
  if (!targetArgumentOrderIsRepresentable(
    planned.map((entry) => entry.parameterIndex),
    selection.targetMember.parameters,
  )) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected target argument relation requires a target argument reorder or omission that cannot be represented positionally.",
    ));
    return undefined;
  }
  return planned.map((entry) => entry.argument);
}

export function translateCallArgument(
  expression: Node,
  parameter: CsharpTargetParameter,
  sourceForm: CsharpSelectedCallArgument["sourceForm"],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  selectedMapping?: CsharpProviderArgumentMapping,
): CsharpArgument | undefined {
  if (sourceForm === "spread-element") {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "Tuple-expanded call arguments require an explicit target tuple expansion plan.",
    ));
    return undefined;
  }
  if (sourceForm === "spread-sequence" && parameter.paramsArray !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "Sequence-spread call arguments require an exact related C# params parameter.",
    ));
    return undefined;
  }
  if (parameter.csharpSourceArgumentAdapter !== undefined) {
    return translateEcmascriptArgumentVectorCallback(
      expression,
      parameter,
      sourceForm,
      sourceFile,
      input,
      diagnostics,
      planCallArgument,
    );
  }
  const targetType = csharpTargetParameterValueType(parameter, sourceForm);
  const expectedType = csharpTypeFromTargetTypeRef(targetType);
  if (expectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      `Selected target parameter '${parameter.name}' has no renderable C# type.`,
    ));
    return undefined;
  }
  if (
    selectedMapping?.kind === "by-value" &&
    (
      selectedMapping.conversion.kind === "provider-argument-adapter" ||
      selectedMapping.conversion.kind === "lifted-provider-argument-adapter"
    )
  ) {
    if (
      sourceForm !== "value" ||
      parameter.passingMode !== "by-value"
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        expression,
        `Exact provider argument adapter '${selectedMapping.conversion.adapter.id}' requires an ordinary by-value source argument.`,
      ));
      return undefined;
    }
    const sourceExpression = planExpression(
      expression,
      sourceFile,
      input,
      diagnostics,
    );
    const adapted = applyCsharpConversionSelection(
      expression,
      sourceFile,
      input,
      diagnostics,
      selectedMapping.sourceType,
      selectedMapping.targetType,
      selectedMapping.conversion,
      sourceExpression,
    );
    return adapted === undefined
      ? undefined
      : { kind: "Argument", expression: adapted };
  }
  if (
    selectedMapping?.kind === "by-value" &&
    selectedMapping.conversion.kind === "delegate-adapter"
  ) {
    if (
      delegateAdapterIsDirectlyTargetTypable(
        expression,
        selectedMapping,
        input,
      )
    ) {
      return planCallArgument(
        expression,
        sourceFile,
        input,
        diagnostics,
        expectedType,
        undefined,
        targetType,
        parameter.passingMode,
        parameter,
      );
    }
    const sourceExpectedType = csharpTypeFromTargetTypeRef(
      selectedMapping.sourceType,
    );
    if (sourceExpectedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        expression,
        "Exact provider delegate adaptation requires a renderable source callable carrier.",
      ));
      return undefined;
    }
    const sourceArgument = planCallArgument(
      expression,
      sourceFile,
      input,
      diagnostics,
      sourceExpectedType,
      undefined,
      selectedMapping.sourceType,
      "by-value",
    );
    if (sourceArgument === undefined) {
      return undefined;
    }
    const adapted = applyCsharpConversionSelection(
      expression,
      sourceFile,
      input,
      diagnostics,
      selectedMapping.sourceType,
      selectedMapping.targetType,
      selectedMapping.conversion,
      sourceArgument.expression,
    );
    return adapted === undefined
      ? undefined
      : { kind: "Argument", expression: adapted };
  }
  return planCallArgument(
    expression,
    sourceFile,
    input,
    diagnostics,
    expectedType,
    undefined,
    targetType,
    parameter.passingMode,
    parameter,
  );
}

function delegateAdapterIsDirectlyTargetTypable(
  expression: Node,
  mapping: Extract<CsharpProviderArgumentMapping, { readonly kind: "by-value" }>,
  input: CsharpPlanningContext,
): boolean {
  const sourceSignature = getCsharpDelegateSignature(mapping.sourceType);
  const targetSignature = getCsharpDelegateSignature(mapping.targetType);
  return (
    input.program.source.ast.is.IsArrowFunction(expression) ||
    input.program.source.ast.is.IsFunctionExpression(expression)
  ) &&
    sourceSignature !== undefined &&
    targetSignature !== undefined &&
    sourceSignature.parameters.length === targetSignature.parameters.length &&
    mapping.conversion.kind === "delegate-adapter" &&
    mapping.conversion.parameterConversions.every((conversion) =>
      conversion.kind === "identity") &&
    mapping.conversion.returnConversion.kind === "identity";
}

function translateEcmascriptArgumentVectorCallback(
  expression: Node,
  parameter: CsharpTargetParameter,
  sourceForm: CsharpSelectedCallArgument["sourceForm"],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpArgument | undefined {
  const adapter = parameter.csharpSourceArgumentAdapter;
  if (
    adapter?.kind !== "ecmascript-argument-vector-callback" ||
    sourceForm !== "value" ||
    parameter.passingMode !== "by-value"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "The selected ECMAScript callback adapter requires one ordinary by-value source argument.",
    ));
    return undefined;
  }
  const effectiveSourceCallableType =
    input.program.expectedTypes.callableTarget(expression) ??
      adapter.sourceCallableType;
  const sourceSignature = getCsharpDelegateSignature(
    effectiveSourceCallableType,
  );
  const targetSignature = getCsharpDelegateSignature(parameter.type);
  const vectorType = targetSignature?.parameters[0];
  if (
    sourceSignature === undefined ||
    targetSignature === undefined ||
    targetSignature.parameters.length !== 1 ||
    vectorType === undefined ||
    !targetTypeRefEquals(
      sourceSignature.returnType,
      targetSignature.returnType,
    ) ||
    sourceSignature.restParameterIndex !== undefined &&
      sourceSignature.restParameterIndex !==
        sourceSignature.parameters.length - 1
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "The selected ECMAScript callback adapter has no exact source-callable and target argument-vector contract.",
    ));
    return undefined;
  }
  const sourceCallableType = csharpTypeFromTargetTypeRef(
    effectiveSourceCallableType,
  );
  const vectorCsharpType = csharpTypeFromTargetTypeRef(vectorType);
  if (sourceCallableType === undefined || vectorCsharpType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "The selected ECMAScript callback adapter contains an unrenderable callable or argument-vector type.",
    ));
    return undefined;
  }
  const plannedSource = planCallArgument(
    expression,
    sourceFile,
    input,
    diagnostics,
    sourceCallableType,
    undefined,
    effectiveSourceCallableType,
    "by-value",
  );
  if (plannedSource === undefined) {
    return undefined;
  }
  const parameterName = `__tsonic_ecmascriptArguments_${
    Math.max(0, input.program.source.ast.pos(expression))
  }_${Math.max(0, input.program.source.ast.end(expression))}`;
  const vectorExpression = {
    kind: "IdentifierName" as const,
    name: parameterName,
  };
  const callbackArguments: CsharpArgument[] = [];
  for (let index = 0; index < sourceSignature.parameters.length; index += 1) {
    const sourceParameterType = sourceSignature.parameters[index]!;
    const rest = sourceSignature.restParameterIndex === index;
    const projectedType = rest
      ? getCsharpJsArrayElementTargetType(sourceParameterType)
      : sourceParameterType;
    const projectedCsharpType = projectedType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(projectedType);
    if (projectedCsharpType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        expression,
        rest
          ? "An ECMAScript callback rest parameter requires an exact JS-array element representation."
          : `ECMAScript callback parameter ${index} has no renderable target representation.`,
      ));
      return undefined;
    }
    callbackArguments.push({
      kind: "Argument",
      expression: {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: vectorExpression,
          name: rest ? "Rest" : "Get",
          typeArguments: [projectedCsharpType],
        },
        arguments: [{
          kind: "Argument",
          expression: { kind: "LiteralExpression", value: index },
        }],
      },
    });
  }
  return {
    kind: "Argument",
    expression: {
      kind: "LambdaExpression",
      parameters: [{
        kind: "Parameter",
        name: parameterName,
        type: vectorCsharpType,
      }],
      body: {
        kind: "InvocationExpression",
        callee: {
          kind: "ParenthesizedExpression",
          expression: {
            kind: "CastExpression",
            type: sourceCallableType,
            expression: plannedSource.expression,
          },
        },
        arguments: callbackArguments,
      },
    },
  };
}
