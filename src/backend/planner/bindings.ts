import {
  AsParameterDeclaration,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../ast/csharp-ast.js";
import { predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";

export interface DestructuringPlannerState {
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
}

export function createDestructuringPlannerState(): DestructuringPlannerState {
  return {
    nextTempIndex: 0,
    nextParameterIndex: 0,
    nextForOfIndex: 0,
    nextForInIndex: 0,
    nextCatchIndex: 0,
    nextControlLabelIndex: 0,
    controlLabels: [],
  };
}

export interface ControlLabelTarget {
  readonly sourceName: string;
  readonly breakLabel: string;
  readonly continueLabel?: string;
}

export function allocateSyntheticParameter(state: DestructuringPlannerState): string {
  const name = `__param${state.nextParameterIndex}`;
  state.nextParameterIndex += 1;
  return name;
}

export function allocateForOfItem(state: DestructuringPlannerState): string {
  const name = `__forOf${state.nextForOfIndex}`;
  state.nextForOfIndex += 1;
  return name;
}

export function allocateForInIndex(state: DestructuringPlannerState): string {
  const name = `__forInIndex${state.nextForInIndex}`;
  state.nextForInIndex += 1;
  return name;
}

export function allocateCatchValue(state: DestructuringPlannerState): string {
  const name = `__catch${state.nextCatchIndex}`;
  state.nextCatchIndex += 1;
  return name;
}

export function allocateControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
  purpose: "break" | "continue",
): string {
  const name = `__label${state.nextControlLabelIndex}_${sourceName}_${purpose}`;
  state.nextControlLabelIndex += 1;
  return sanitizeIdentifier(name);
}

export function planVariableBindingStatements(
  bindingName: Node | undefined,
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] | undefined {
  if (bindingName === undefined || bindingName.Kind === KindIdentifier) {
    return undefined;
  }
  if (bindingName.Kind !== KindObjectBindingPattern && bindingName.Kind !== KindArrayBindingPattern) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Variable binding name is outside the current C# planning surface."));
    return [];
  }
  if (initializer === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Destructuring variable declaration requires an initializer."));
    return [];
  }
  const sourceName = allocateDestructuringTemp(state);
  const sourceExpression: CsharpExpression = { kind: "identifier", name: sourceName };
  return [
    {
      kind: "local",
      name: sourceName,
      type: predefined("var"),
      initializer: planExpression(initializer, sourceFile, input, diagnostics),
    },
    ...planBindingPatternFromExpression(bindingName, sourceExpression, initializer, sourceFile, input, diagnostics, state),
  ];
}

export function planParameterBindingPrelude(
  bindingName: Node | undefined,
  parameterName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (bindingName === undefined || bindingName.Kind === KindIdentifier) {
    return [];
  }
  if (bindingName.Kind !== KindObjectBindingPattern && bindingName.Kind !== KindArrayBindingPattern) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Parameter binding name is outside the current C# planning surface."));
    return [];
  }
  const parameter = AsParameterDeclaration(getNodeParent(bindingName));
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "identifier", name: parameterName },
    parameter?.Type,
    sourceFile,
    input,
    diagnostics,
    state,
  );
}

export function planBindingPatternFromExpression(
  patternNode: Node,
  _sourceExpression: CsharpExpression,
  _sourceNode: Node | undefined,
  _sourceFile: SourceFile,
  _input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  _state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Destructuring requires finalized TSTS/provider object or collection shape facts before C# emission."));
  return [];
}

function allocateDestructuringTemp(state: DestructuringPlannerState): string {
  const name = `__destructure${state.nextTempIndex}`;
  state.nextTempIndex += 1;
  return name;
}

function getNodeParent(node: Node): Node | undefined {
  return (node as { readonly Parent?: Node }).Parent;
}
