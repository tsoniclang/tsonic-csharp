import type { CsharpPlanningContext } from "../context.js";
import {
  AsParameterDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import {
  getCsharpTypeForExpressionCarrier,
  planBindingPatternFromExpression,
} from "./binding-patterns.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planExpression, planExpressionWithExpectedType } from "../expressions/index.js";

export {
  allocateCatchValue,
  allocateControlLabel,
  allocateForInNames,
  allocateForOfItem,
  allocateGeneratorNames,
  allocateGeneratorDelegationNames,
  allocateResourceScopeNames,
  allocateStringIterationNames,
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  createNestedPlannerState,
  declareCsharpLocalBindingName,
  declareCsharpTypedLocationIdentityName,
  getCsharpLocalBindingName,
  getCsharpTypedLocationIdentityName,
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] | undefined {
  if (bindingName === undefined || HasSourceKind(input.program.source.ast, bindingName, KindIdentifier)) {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern)) {
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
  const initializerExpression = planExpression(initializer, sourceFile, input, diagnostics);
  if (initializerExpression === undefined) {
    return [];
  }
  return [
    {
      kind: "LocalDeclarationStatement",
      name: sourceName,
      type: sourceType,
      initializer: initializerExpression,
    },
    ...planBindingPatternFromExpression(bindingName, sourceExpression, initializer, sourceFile, input, diagnostics, state, undefined, planExpressionWithExpectedType),
  ];
}

export function planParameterBindingPrelude(
  bindingName: Node | undefined,
  parameterName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (bindingName === undefined || HasSourceKind(input.program.source.ast, bindingName, KindIdentifier)) {
    return [];
  }
  if (!HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern)) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Parameter binding name is outside the current C# planning surface."));
    return [];
  }
  const parameter = AsParameterDeclaration(input.program.source.ast, getNodeParent(bindingName));
  const bindingSource = parameter ?? bindingName;
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "IdentifierName", name: parameterName },
    bindingSource,
    sourceFile,
    input,
    diagnostics,
    state,
    undefined,
    planExpressionWithExpectedType,
  );
}

function getNodeParent(node: Node): Node | undefined {
  return (node as { readonly Parent?: Node }).Parent;
}
