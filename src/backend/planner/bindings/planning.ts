import type { CsharpPlanningContext } from "../context.js";
import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import {
  getCsharpTypeForExpressionCarrier,
  planBindingPatternFromExpression,
} from "./binding-patterns.js";
import type { CsharpEntryBinding } from "./binding-patterns.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planExpression } from "../expressions/index.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";

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
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] | undefined {
  if (bindingName === undefined || HasSourceKind(input.program.source.ast, bindingName, KindIdentifier)) {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern)) {
    return failCsharpPlannerInvariant("A checked variable binding must be an identifier or binding pattern.", bindingName);
  }
  if (initializer === undefined) {
    return failCsharpPlannerInvariant("A checked destructuring declaration requires its initializer.", bindingName);
  }
  const sourceName = allocateDestructuringTemp(state);
  const sourceExpression: CsharpExpression = { kind: "IdentifierName", name: sourceName };
  const sourceType = getCsharpTypeForExpressionCarrier(initializer, input, diagnostics, bindingName, "Destructuring source expression");
  const initializerExpression = planExpression(initializer, sourceFile, input, diagnostics, state
  );
  if (initializerExpression === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(initializerExpression, expression => [
    {
      kind: "LocalDeclarationStatement",
      name: sourceName,
      type: sourceType,
      initializer: expression,
    },
    ...planBindingPatternFromExpression(bindingName, sourceExpression, sourceFile, input, diagnostics, state, planExpression, retainBinding),
  ]);
}

export function planParameterBindingPrelude(
  bindingName: Node | undefined,
  parameterName: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  if (bindingName === undefined || HasSourceKind(input.program.source.ast, bindingName, KindIdentifier)) {
    return [];
  }
  if (!HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern)) {
    return failCsharpPlannerInvariant("A checked parameter binding must be an identifier or binding pattern.", bindingName);
  }
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "IdentifierName", name: parameterName },
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
    retainBinding,
  );
}
