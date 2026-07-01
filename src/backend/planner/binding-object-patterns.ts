import {
  AsBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import { getSemanticOwnership, pushMissingTargetFactDiagnostic } from "./semantic-guards.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import {
  isSourceOwnedBindingElement,
  planObjectBindingElement,
} from "./binding-object-source-patterns.js";
import {
  planObjectShapeBindingPattern,
} from "./binding-object-shape-patterns.js";

export function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const objectShape = getObjectShapeForBindingSource(sourceNode, sourceFile, input);
  if (objectShape !== undefined) {
    csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, patternNode);
    return planObjectShapeBindingPattern(patternNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  }
  const ownership = getSemanticOwnership(sourceNode, sourceFile, input);
  const sourceOwnedBindingElement = isSourceOwnedBindingElement(sourceNode, sourceFile, input);
  if (!sourceOwnedBindingElement && (ownership.requiresTargetFact || !ownership.sourceOwned)) {
    pushMissingTargetFactDiagnostic(diagnostics, patternNode, "Object destructuring requires a source-owned declaration or finalized provider object-shape facts before C# emission.", ownership);
    return [];
  }
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectBindingElement(elementNode, sourceExpression, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  });
}

export function getObjectShapeForBindingSource(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(sourceNode, sourceFile, input);
}
