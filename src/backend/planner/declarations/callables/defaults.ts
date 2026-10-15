import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetPlannerInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { planExpressionWithExpectedType } from "../../expressions/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import type { CsharpPlannedValue } from "../../expressions/planned-values.js";
import { planCsharpBindingDefaultValue } from "../../bindings/optional-values.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

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
): CsharpRuntimeParameterDefaultPlan | undefined {
  const initialDiagnosticCount = diagnostics.length;
  const selected = planRuntimeParameterDefault(node, incomingName, sourceFile, input, diagnostics, state);
  if (selected === undefined && !diagnostics.slice(initialDiagnosticCount).some(diagnostic => diagnostic.category === "error")) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Required C# runtime parameter default lowering produced neither a native parameter nor an error."));
  }
  return selected;
}

function planRuntimeParameterDefault(
  node: Node,
  incomingName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpRuntimeParameterDefaultPlan | undefined {
  const contract = input.program.records.runtimeDefault.get(node);
  if (contract === undefined) {
    return failTargetPlannerInvariant("tsonic-csharp", "A runtime parameter default requires its sealed contract.", node);
  }
  const declaration = input.program.source.ast.as.AsParameterDeclaration(node);
  if (declaration?.Initializer === undefined) {
    return failTargetPlannerInvariant("tsonic-csharp",
      "A runtime parameter default contract requires its authored parameter initializer.", node);
  }
  const valueType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, contract.valueType, diagnostics, node);
  const parameterType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, contract.parameterType, diagnostics, node);
  if (valueType === undefined || parameterType === undefined) return undefined;
  const initializer = planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics,
    valueType, declaration.Type ?? declaration.name, state, contract.valueType);
  if (initializer === undefined) return undefined;
  const incoming: CsharpExpression = { kind: "IdentifierName", name: incomingName };
  const value = planCsharpBindingDefaultValue(node, sourceFile, input, diagnostics,
    incoming, contract.parameterType, initializer, contract.valueType, state);
  if (value === undefined) return undefined;
  return {
    valueType, parameterType,
    passthrough: targetTypeRefEquals(contract.valueType, contract.parameterType) && value.prelude.length === 0 && value.completion.kind === "value" &&
      value.completion.expression.kind === "IdentifierName" && value.completion.expression.name === incomingName,
    ...(contract.acceptsOmission ? {
      defaultValue: contract.kind === "nullable" ? { kind: "LiteralExpression", value: null } as const
        : { kind: "DefaultExpression", type: parameterType } as const,
    } : {}),
    value,
  };
}
