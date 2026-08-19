import type { CsharpPlanningContext } from "../context.js";
import { AsBindingPattern } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { getCsharpObjectShapeFactForNode } from "../objects/fact-queries.js";
import { csharpTypeFromObjectShapeFact } from "../objects/index.js";
import type { CsharpObjectShapeFact } from "../../../policy/types/index.js";
import {
  isSourceOwnedBindingSource,
  planObjectBindingElement,
} from "./binding-object-source-patterns.js";
import {
  planObjectShapeBindingPattern,
} from "./binding-object-shape-patterns.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  if (!isSourceOwnedBindingSource(sourceNode, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      patternNode,
      "Object destructuring requires an exact source-owned declaration or target object-shape policy.",
    ));
    return [];
  }
  const elements = AsBindingPattern(input.ast, patternNode)?.Elements?.Nodes ?? [];
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
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(sourceNode, sourceFile, input);
}
