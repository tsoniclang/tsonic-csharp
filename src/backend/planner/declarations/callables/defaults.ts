import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { planExpression } from "../../expressions/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import type { CsharpPlannedValue } from "../../expressions/planned-values.js";
import { planCsharpBindingDefaultValue } from "../../bindings/optional-values.js";
import type { CsharpDefaultParameterContract } from "../../../../target-model/records/program/declarations.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { csharpPlannedValue } from "../../expressions/planned-values.js";

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
): CsharpRuntimeParameterDefaultPlan {
  const contract = input.program.records.runtimeDefault.get(node);
  if (contract === undefined) {
    return failCsharpPlannerInvariant("A runtime parameter default requires its sealed contract.", node);
  }
  return planRuntimeParameterDefault(node, contract, contract.native.source, incomingName, sourceFile, input, diagnostics, state);
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
): CsharpRuntimeParameterDefaultPlan {
  const declaration = input.program.source.ast.as.AsParameterDeclaration(node);
  if (declaration?.Initializer === undefined) {
    return failCsharpPlannerInvariant(
      "A runtime parameter default contract requires its authored parameter initializer.", node);
  }
  const valueType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, contract.valueType, diagnostics, node);
  const parameterType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, incomingType, diagnostics, node);
  if (valueType === undefined || parameterType === undefined) {
    failCsharpPlannerInvariant("An admitted runtime parameter default requires renderable native value and incoming carriers.", node);
  }
  const incoming: CsharpExpression = { kind: "IdentifierName", name: incomingName };
  if (contract.kind === "present") return {
    valueType, parameterType, passthrough: true,
    value: csharpPlannedValue(contract.valueType, incoming),
  };
  const initializer = planExpression(declaration.Initializer, sourceFile, input, diagnostics, state);
  if (initializer === undefined) failCsharpPlannerInvariant("An admitted runtime parameter default requires its native initializer plan.", declaration.Initializer);
  const value = planCsharpBindingDefaultValue(node, sourceFile, input, diagnostics,
    incoming, contract.native, initializer, state);
  if (value === undefined) failCsharpPlannerInvariant("An admitted runtime parameter default requires its native value plan.", node);
  return {
    valueType, parameterType,
    passthrough: contract.passthrough,
    ...(contract.acceptsOmission ? {
      defaultValue: contract.kind === "nullable" ? { kind: "LiteralExpression", value: null } as const
        : { kind: "DefaultExpression", type: parameterType, nullForgiving: true } as const,
    } : {}),
    value,
  };
}
