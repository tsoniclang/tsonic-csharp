import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { planExpression } from "../../expressions/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../expressions/planned-values.js";
import { convertCsharpPlannedValue } from "../../expressions/planned-value-conversions.js";
import { planCsharpBindingDefaultValue } from "../../bindings/optional-values.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpDefaultParameterContract } from "../../../../target-model/records/declarations.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../../diagnostics.js";

type CsharpRuntimeParameterDefaultPlan = {
  readonly valueType: CsharpTypeNode;
  readonly parameterType: CsharpTypeNode;
  readonly defaultValue?: CsharpExpression;
  readonly value: CsharpPlannedValue;
  readonly passthrough: boolean;
};

export function planCsharpRuntimeParameterDefault(
  node: Node,
  incomingName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  selectedParameterType?: TargetTypeRef,
): CsharpRuntimeParameterDefaultPlan | undefined {
  const contract = input.program.records.runtimeDefault.get(node);
  if (contract === undefined) {
    return failCsharpPlannerInvariant("A runtime parameter default requires its sealed contract.", node);
  }
  const incomingType = selectedParameterType ?? contract.parameterType;
  if (!targetTypeRefEquals(incomingType, contract.native.source)) return failCsharpPlannerInvariant(
    "A runtime default requires its admitted native incoming parameter carrier.", node);
  return planRuntimeParameterDefault(node, contract, incomingType, incomingName, sourceFile, input, diagnostics, state);
}

function planRuntimeParameterDefault(
  node: Node,
  contract: CsharpDefaultParameterContract,
  incomingType: TargetTypeRef,
  incomingName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpRuntimeParameterDefaultPlan | undefined {
  const declaration = input.program.source.ast.as.AsParameterDeclaration(node);
  if (declaration?.Initializer === undefined) {
    return failCsharpPlannerInvariant(
      "A runtime parameter default contract requires its authored parameter initializer.", node);
  }
  const valueType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, contract.valueType, diagnostics, node);
  const parameterType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, incomingType, diagnostics, node);
  if (valueType === undefined || parameterType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A runtime parameter default requires renderable sealed native value and incoming carriers."));
    return undefined;
  }
  const incoming: CsharpExpression = { kind: "IdentifierName", name: incomingName };
  let value: CsharpPlannedValue | undefined;
  if (contract.native.kind === "value") {
    value = convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(incomingType, incoming), contract.valueType, "implicit");
  } else {
    const initializer = planExpression(declaration.Initializer, sourceFile, input, diagnostics, state);
    if (initializer === undefined) return undefined;
    value = planCsharpBindingDefaultValue(node, sourceFile, input, diagnostics,
      incoming, contract.native, initializer, state);
  }
  if (value === undefined) return undefined;
  return {
    valueType, parameterType,
    passthrough: targetTypeRefEquals(contract.valueType, incomingType) && value.prelude.length === 0 && value.completion.kind === "value" &&
      value.completion.expression.kind === "IdentifierName" && value.completion.expression.name === incomingName,
    ...(contract.acceptsOmission ? {
      defaultValue: contract.kind === "nullable" ? { kind: "LiteralExpression", value: null } as const
        : { kind: "DefaultExpression", type: parameterType } as const,
    } : {}),
    value,
  };
}
