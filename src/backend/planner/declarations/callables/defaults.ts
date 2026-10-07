import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { planExpressionWithExpectedType } from "../../expressions/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import type { CsharpPlannedValue } from "../../expressions/planned-values.js";
import { planCsharpBindingDefaultValue } from "../../bindings/optional-values.js";

export function planCsharpRuntimeParameterDefault(
  node: Node,
  incomingName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): { readonly valueType: CsharpTypeNode; readonly parameterType: CsharpTypeNode;
  readonly defaultValue?: CsharpExpression; readonly value: CsharpPlannedValue } | undefined {
  const contract = input.program.declarations.runtimeDefault(node);
  const declaration = input.program.source.ast.as.AsParameterDeclaration(node);
  if (contract === undefined || declaration?.Initializer === undefined) return undefined;
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
    ...(contract.acceptsOmission ? {
      defaultValue: contract.kind === "nullable" ? { kind: "LiteralExpression", value: null } as const
        : { kind: "DefaultExpression", type: parameterType } as const,
    } : {}),
    value,
  };
}
