import {
  AsParameterDeclaration,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpParameter, CsharpStatement } from "../ast/csharp-ast.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";
import { planIdentifierName } from "./names.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
}

export function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpParameter[] {
  return planParametersWithPrelude(parameterNodes, sourceFile, input, diagnostics).parameters;
}

export function planParametersWithPrelude(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): PlannedParameterList {
  const parameters: CsharpParameter[] = [];
  const prelude: CsharpStatement[] = [];
  let hasDefaultParameter = false;
  for (const parameterNode of parameterNodes) {
    const parameter = AsParameterDeclaration(parameterNode)!;
    const defaultValue = planParameterDefaultValue(parameter.Initializer, sourceFile, input, diagnostics);
    if (defaultValue !== undefined) {
      hasDefaultParameter = true;
    } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
    }
    if (parameter.name?.Kind === KindIdentifier) {
      parameters.push({
        name: planIdentifierName(parameter.name, "arg", diagnostics, "Parameter name"),
        type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, undefined, diagnostics),
        ...(parameter.DotDotDotToken === undefined ? {} : { isParams: true }),
        ...(defaultValue === undefined ? {} : { defaultValue }),
      });
      continue;
    }
    if (parameter.name?.Kind === KindObjectBindingPattern || parameter.name?.Kind === KindArrayBindingPattern) {
      if (defaultValue !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name, "Destructured parameter defaults require target object-shape lowering before C# emission."));
      }
      const parameterName = allocateSyntheticParameter(state);
      parameters.push({
        name: parameterName,
        type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, predefined("object"), diagnostics),
        ...(parameter.DotDotDotToken === undefined ? {} : { isParams: true }),
      });
      prelude.push(...planParameterBindingPrelude(parameter.name, parameterName, sourceFile, input, diagnostics, state));
      continue;
    }
    diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode!, "Parameter name is outside the current C# planning surface."));
    parameters.push({
      name: planIdentifierName(parameter.name, "arg", diagnostics, "Parameter name"),
      type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, undefined, diagnostics),
      ...(defaultValue === undefined ? {} : { defaultValue }),
    });
  }
  return { parameters, prelude };
}

function planParameterDefaultValue(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const defaultValue = planExpression(initializer, sourceFile, input, diagnostics);
  if (defaultValue.kind === "literal") {
    return defaultValue;
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "C# parameter defaults require compile-time literal values."));
  return undefined;
}
