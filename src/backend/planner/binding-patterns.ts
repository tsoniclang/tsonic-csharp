import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { planArrayBindingPattern } from "./binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { getCsharpTypeFromSemanticType } from "./csharp-semantic-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import {
  getObjectShapeForBindingSource,
  planObjectBindingPattern,
} from "./binding-object-patterns.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import {
  getArrayBoundaryCoreCarrierForExpression,
} from "./array-boundary-facts.js";

export function planBindingPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
  if (HasSourceKind(input.ast, patternNode, KindArrayBindingPattern)) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner, planDefaultExpressionWithExpectedType, sourceCarrier);
  }
  if (HasSourceKind(input.ast, patternNode, KindObjectBindingPattern)) {
    return planObjectBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner);
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  projectedCarrier?: TargetTypeRef,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (HasSourceKind(input.ast, name, KindIdentifier)) {
    return [{
      kind: "LocalDeclarationStatement",
      name: requireCsharpIdentifier(Node_Text(name), diagnostics, "Destructuring binding"),
      type: projectedType ??
        getCsharpTypeFromSemanticType(input.analysis.getTypeAtLocation(name, { sourceFile }), sourceFile, input) ??
        getCsharpTypeForNode(name, sourceFile, input, invalidCsharpType("missing destructured binding type"), diagnostics),
      initializer: projected,
    }];
  }
  if (HasSourceKind(input.ast, name, KindObjectBindingPattern) || HasSourceKind(input.ast, name, KindArrayBindingPattern)) {
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
  description: string,
): CsharpTypeNode {
  const carrier = getArrayBoundaryCoreCarrierForExpression(input, expression, sourceFile) ??
    getRuntimeCarrierForExpression(input, expression, sourceFile);
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
  diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${description} requires a finalized runtime carrier fact before C# emission.`));
  return invalidCsharpType("missing destructuring source carrier");
}
