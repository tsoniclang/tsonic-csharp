import type { CsharpPlanningContext } from "../context.js";
import { AsBindingPattern } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { missingBindingPatternProjectionMessage } from "./binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { getCsharpObjectShapeFactForNode } from "../objects/fact-queries.js";
import { csharpTypeFromObjectShapeFact } from "../objects/index.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import { planObjectBindingElement } from "./binding-object-source-patterns.js";
import {
  planObjectShapeBindingPattern,
} from "./binding-object-shape-patterns.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const source = input.program.records.bindingPatternProjection.get(patternNode)?.source;
  if (source?.kind === "object-shape-source") {
    csharpTypeFromObjectShapeFact(input, source.shape, diagnostics, patternNode);
    return planObjectShapeBindingPattern(patternNode, sourceExpression, source.shape, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  }
  if (source?.kind !== "source-owned-source") {
    diagnostics.push(unsupportedNodeDiagnostic(patternNode, missingBindingPatternProjectionMessage));
    return [];
  }
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
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
