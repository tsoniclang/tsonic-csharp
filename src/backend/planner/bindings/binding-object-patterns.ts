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
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { csharpTypeFromObjectShapeFact } from "../objects/index.js";
import { planObjectBindingElement } from "./binding-object-source-patterns.js";
import {
  planObjectShapeBindingPattern,
} from "./binding-object-shape-patterns.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression?: ExpressionPlanner,
): readonly CsharpStatement[] {
  const selected = input.program.records.bindingPatternProjection.get(patternNode)?.source;
  if (selected?.kind === "object-shape-source") {
    const objectShape = selected.shape;
    csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, patternNode);
    return planObjectShapeBindingPattern(patternNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planExpression);
  }
  if (selected?.kind !== "source-owned-source") return failCsharpPlannerInvariant(
    "Object binding requires its admitted native source projection.", patternNode);
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      failCsharpPlannerInvariant("An admitted object pattern requires its dense checked element list.", patternNode);
    }
    return planObjectBindingElement(elementNode, sourceExpression, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  });
}
