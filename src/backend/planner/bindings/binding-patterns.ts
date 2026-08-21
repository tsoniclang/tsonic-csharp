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
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import { planArrayBindingPattern } from "./binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { getCsharpTypeFromSemanticType } from "../types/csharp-semantic-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { requireCsharpIdentifier } from "../../../policy/names/identifiers.js";
import {
  getObjectShapeForBindingSource,
  planObjectBindingPattern,
} from "./binding-object-patterns.js";
import { csharpTypeFromObjectShapeFact } from "../objects/index.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "../types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import {
  getArrayBoundaryCoreCarrierForExpression,
} from "../expressions/arrays/boundary-facts.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";

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
): readonly CsharpStatement[] {
  if (HasSourceKind(input.program.source.ast, name, KindIdentifier)) {
    const identity = projectionNode === undefined
      ? undefined
      : planCsharpTypedLocationIdentityDeclaration(
          projectionNode,
          input,
          state,
        );
    return [
      ...(identity === undefined ? [] : [identity]),
      {
        kind: "LocalDeclarationStatement",
        name: requireCsharpIdentifier(Node_Text(input.program.source.ast, name), diagnostics, "Destructuring binding"),
        type: projectedType ??
          getCsharpTypeFromSemanticType(
            input.program.source.semantics.forFile(sourceFile).types.expressionType(name),
            sourceFile,
            input,
          ) ??
          getCsharpTypeForNode(name, sourceFile, input, invalidCsharpType("missing destructured binding type"), diagnostics),
        initializer: projected,
      },
    ];
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
      ...planBindingPatternFromExpression(name, nestedSource, projectionNode, sourceFile, input, diagnostics, state, projectedCarrier, planDefaultExpressionWithExpectedType),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(name, "Destructuring target binding name is outside the current C# planning surface."));
  return [];
}

export function getCsharpTypeForExpressionCarrier(
  expression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
  description: string,
): CsharpTypeNode {
  const carrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
  const carrier = getArrayBoundaryCoreCarrierForExpression(input, expression, sourceFile) ??
    probeCarrierFromResolution(carrierResolution);
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
  if (type !== undefined) {
    return type;
  }
  const objectShape = getObjectShapeForBindingSource(expression, sourceFile, input);
  if (objectShape !== undefined) {
    const objectShapeType = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, diagnosticNode);
    if (objectShapeType !== undefined) {
      return objectShapeType;
    }
  }
  const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the destructuring source expression.");
  diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${description} requires a finalized runtime carrier fact before C# emission. ${detail.reason}`, detail.evidence));
  return invalidCsharpType("missing destructuring source carrier");
}
