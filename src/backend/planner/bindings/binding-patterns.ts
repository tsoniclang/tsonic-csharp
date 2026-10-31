import { planCsharpCapturedInitialization } from "./capture-storage.js";
import type {
  CsharpPlanningContext } from "../context.js";
import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import type { Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { planArrayBindingPattern } from "./binding-array-patterns.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planObjectBindingPattern } from "./binding-object-patterns.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";
import { requireCsharpNativeExpressionUse } from "../expressions/native-uses.js";
import { applyCsharpConversionSelection } from "../expressions/conversions.js";

export interface CsharpEntryBinding {
  readonly name: string;
  readonly type: CsharpTypeNode;
}

export function planBindingPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression?: ExpressionPlanner,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  const projectionPlanner: BindingProjectionPlanner = (
    name,
    projected,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
  ) => planBindingNameFromProjection(
    name,
    projected,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
    planExpression,
    retainBinding,
  );
  if (HasSourceKind(input.program.source.ast, patternNode, KindArrayBindingPattern)) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceFile, input, diagnostics, state, projectionPlanner, planExpression);
  }
  if (HasSourceKind(input.program.source.ast, patternNode, KindObjectBindingPattern)) {
    return planObjectBindingPattern(patternNode, sourceExpression, sourceFile, input, diagnostics, state, projectionPlanner, planExpression);
  }
  return failCsharpPlannerInvariant("An admitted binding pattern lost its checked object or array form.", patternNode);
}

function planBindingNameFromProjection(
  name: Node,
  projected: CsharpExpression,
  projectionNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression?: ExpressionPlanner,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  const binding = input.program.records.bindingPatternProjection.get(projectionNode)?.binding;
  if (binding === undefined || binding.node !== name) return failCsharpPlannerInvariant(
    "An admitted binding projection requires its exact extraction, destination and conversion.", projectionNode);
  const type = csharpTypeFromTargetTypeRef(binding.target, input.scope.typeParameterNames);
  if (type === undefined) return failCsharpPlannerInvariant(
    "An admitted binding destination lost its native carrier rendering.", projectionNode);
  const prelude: CsharpStatement[] = [];
  const initializedValue = applyCsharpConversionSelection(projectionNode, sourceFile, input, diagnostics,
    binding.source, binding.target, binding.conversion, projected, prelude, "snapshot");
  if (initializedValue === undefined) return failCsharpPlannerInvariant(
    "An admitted binding conversion lost its selected native renderer.", projectionNode);
  if (HasSourceKind(input.program.source.ast, name, KindIdentifier)) {
    const declaration = projectionNode;
    const captured = planCsharpCapturedInitialization(declaration, initializedValue, input, state);
    const identity = planCsharpTypedLocationIdentityDeclaration(
          projectionNode,
          input,
          state,
        );
    const selectedName = input.program.records.sourceName.get(name);
    if (selectedName.kind !== "resolved") return failCsharpPlannerInvariant(
      "An admitted destructured binding lost its pre-seal native name.", name);
    const local = captured === undefined ? {
        kind: "LocalDeclarationStatement" as const,
        name: selectedName.name,
        type,
        initializer: initializedValue,
      } : undefined;
    if (identity !== undefined) retainBinding?.(identity, declaration);
    if (local !== undefined) retainBinding?.(local, declaration);
    const moduleBinding =
      input.program.records.moduleBindingInitialization.get(declaration) === "value";
    const initialized = (binding: Extract<CsharpStatement, { readonly kind: "LocalDeclarationStatement" }>): CsharpStatement =>
      moduleBinding ? {
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: { kind: "IdentifierName", name: binding.name },
          operatorToken: { kind: "EqualsToken" },
          right: binding.initializer!,
        },
      } : binding;
    return [...prelude, ...(identity === undefined ? [] : [initialized(identity)]),
      ...(local === undefined ? [captured!] : [initialized(local)])];
  }
  if (HasSourceKind(input.program.source.ast, name, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, name, KindArrayBindingPattern)) {
    const nestedName = allocateDestructuringTemp(state);
    const nestedSource: CsharpExpression = { kind: "IdentifierName", name: nestedName };
    return [
      ...prelude,
      {
        kind: "LocalDeclarationStatement",
        name: nestedName,
        type,
        initializer: initializedValue,
      },
      ...planBindingPatternFromExpression(name, nestedSource, sourceFile, input, diagnostics, state, planExpression, retainBinding),
    ];
  }
  return failCsharpPlannerInvariant("An admitted destructuring target lost its checked binding name.", name);
}

export function getCsharpTypeForExpressionCarrier(
  expression: Node,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
  description: string,
): CsharpTypeNode {
  const selected = requireCsharpNativeExpressionUse(input, expression).use;
  const carrier = selected.kind === "erased" ? undefined : selected.completion.kind === "value"
    ? selected.completion.type : selected.carrier;
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (type !== undefined) {
    return type;
  }
  return failCsharpPlannerInvariant(`${description} lost its admitted native source carrier rendering.`, diagnosticNode);
}
