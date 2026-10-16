import { planCsharpCapturedInitialization } from "./capture-storage.js";
import type {
  CsharpPlanningContext } from "../context.js";
import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
  Node_Text,
} from "@tsonic/target-api/source";
import type { Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { planArrayBindingPattern } from "./binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { getCsharpTypeFromSemanticType } from "../types/csharp-semantic-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import { planObjectBindingPattern } from "./binding-object-patterns.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";
import { requireCsharpNativeExpressionUse } from "../expressions/native-uses.js";

export interface CsharpEntryBinding {
  readonly name: string;
  readonly type: CsharpTypeNode;
}

export function planBindingPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  sourceCarrier?: TargetTypeRef,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  const projectionPlanner: BindingProjectionPlanner = (
    name,
    projected,
    projectedType,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
    projectedCarrier,
  ) => planBindingNameFromProjection(
    name,
    projected,
    projectedType,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
    projectedCarrier,
    planDefaultExpressionWithExpectedType,
    retainBinding,
  );
  if (HasSourceKind(input.program.source.ast, patternNode, KindArrayBindingPattern)) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner, planDefaultExpressionWithExpectedType, sourceCarrier);
  }
  if (HasSourceKind(input.program.source.ast, patternNode, KindObjectBindingPattern)) {
    return planObjectBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner, planDefaultExpressionWithExpectedType);
  }
  diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Binding pattern is outside the current C# planning surface."));
  return [];
}

function planBindingNameFromProjection(
  name: Node,
  projected: CsharpExpression,
  projectedType: CsharpTypeNode | undefined,
  projectionNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  projectedCarrier?: TargetTypeRef,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  if (HasSourceKind(input.program.source.ast, name, KindIdentifier)) {
    const declaration = input.program.sourceNavigation.sourceReferenceFor(name)?.declaration ?? projectionNode;
    const captured = declaration === undefined ? undefined : planCsharpCapturedInitialization(declaration, projected, input, state);
    const identity = projectionNode === undefined
      ? undefined
      : planCsharpTypedLocationIdentityDeclaration(
          projectionNode,
          input,
          state,
        );
    const local = captured === undefined ? {
        kind: "LocalDeclarationStatement" as const,
        name: requireCsharpIdentifier(Node_Text(input.program.source.ast, name), diagnostics, "Destructuring binding"),
        type: projectedType ??
          getCsharpTypeFromSemanticType(
            input.program.records.expressionType.get(name),
            sourceFile,
            input,
          ) ??
          getCsharpTypeForNode(name, sourceFile, input, invalidCsharpType("missing destructured binding type"), diagnostics),
        initializer: projected,
      } : undefined;
    if (retainBinding !== undefined && declaration === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(name, "A retained binding requires its exact source declaration."));
      return [];
    }
    if (identity !== undefined) retainBinding?.(identity, declaration!);
    if (local !== undefined) retainBinding?.(local, declaration!);
    return [...(identity === undefined ? [] : [identity]), ...(local === undefined ? [captured!] : [local])];
  }
  if (HasSourceKind(input.program.source.ast, name, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, name, KindArrayBindingPattern)) {
    const nestedName = allocateDestructuringTemp(state);
    const nestedSource: CsharpExpression = { kind: "IdentifierName", name: nestedName };
    const nestedType = projectedType ?? getCsharpTypeForNode(projectionNode ?? name, sourceFile, input, invalidCsharpType("missing nested destructuring source type"), diagnostics);
    return [
      {
        kind: "LocalDeclarationStatement",
        name: nestedName,
        type: nestedType,
        initializer: projected,
      },
      ...planBindingPatternFromExpression(name, nestedSource, projectionNode, sourceFile, input, diagnostics, state, projectedCarrier, planDefaultExpressionWithExpectedType, retainBinding),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(name, "Destructuring target binding name is outside the current C# planning surface."));
  return [];
}

export function getCsharpTypeForExpressionCarrier(
  expression: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
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
  diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${description} requires its admitted native source carrier before C# emission.`));
  return invalidCsharpType("missing destructuring source carrier");
}
