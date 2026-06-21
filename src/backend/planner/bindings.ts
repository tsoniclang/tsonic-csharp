import {
  AsParameterDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement } from "../roslyn/syntax.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import {
  getCsharpTypeForExpressionCarrier,
  planBindingPatternFromExpression,
} from "./binding-patterns.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";

export {
  allocateCatchValue,
  allocateControlLabel,
  allocateForInNames,
  allocateForOfItem,
  allocateStringIterationNames,
  allocateSyntheticParameter,
  createDestructuringPlannerState,
} from "./binding-state.js";
export { planBindingPatternFromExpression } from "./binding-patterns.js";
export type {
  ControlLabelTarget,
  DestructuringPlannerState,
} from "./binding-state.js";

export function planVariableBindingStatements(
  bindingName: Node | undefined,
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] | undefined {
  if (bindingName === undefined || HasSourceKind(input.ast, bindingName, KindIdentifier)) {
    return undefined;
  }
  if (!HasSourceKind(input.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.ast, bindingName, KindArrayBindingPattern)) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Variable binding name is outside the current C# planning surface."));
    return [];
  }
  if (initializer === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Destructuring variable declaration requires an initializer."));
    return [];
  }
  const sourceName = allocateDestructuringTemp(state);
  const sourceExpression: CsharpExpression = { kind: "IdentifierName", name: sourceName };
  const sourceType = getCsharpTypeForExpressionCarrier(initializer, sourceFile, input, diagnostics, bindingName, "Destructuring source expression");
  return [
    {
      kind: "LocalDeclarationStatement",
      name: sourceName,
      type: sourceType,
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
  if (bindingName === undefined || HasSourceKind(input.ast, bindingName, KindIdentifier)) {
    return [];
  }
  if (!HasSourceKind(input.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.ast, bindingName, KindArrayBindingPattern)) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Parameter binding name is outside the current C# planning surface."));
    return [];
  }
  const parameter = AsParameterDeclaration(getNodeParent(bindingName));
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "IdentifierName", name: parameterName },
    parameter?.Type,
    sourceFile,
    input,
    diagnostics,
    state,
  );
}

function getNodeParent(node: Node): Node | undefined {
  return (node as { readonly Parent?: Node }).Parent;
}
