import {
  AsParameterDeclaration,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpParameter, CsharpStatement } from "../ast/csharp-ast.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
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
  for (const parameterNode of parameterNodes) {
    const parameter = AsParameterDeclaration(parameterNode)!;
    if (parameter.DotDotDotToken !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Rest parameters require target varargs facts before C# emission."));
    }
    if (parameter.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Default parameter initializers require target optional-argument lowering before C# emission."));
    }
    if (parameter.name?.Kind === KindIdentifier) {
      parameters.push({
        name: planIdentifierName(parameter.name, "arg", diagnostics, "Parameter name"),
        type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, undefined, diagnostics),
      });
      continue;
    }
    if (parameter.name?.Kind === KindObjectBindingPattern || parameter.name?.Kind === KindArrayBindingPattern) {
      const parameterName = allocateSyntheticParameter(state);
      parameters.push({
        name: parameterName,
        type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, predefined("object"), diagnostics),
      });
      prelude.push(...planParameterBindingPrelude(parameter.name, parameterName, sourceFile, input, diagnostics, state));
      continue;
    }
    diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode!, "Parameter name is outside the current C# planning surface."));
    parameters.push({
      name: planIdentifierName(parameter.name, "arg", diagnostics, "Parameter name"),
      type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input, undefined, diagnostics),
    });
  }
  return { parameters, prelude };
}
