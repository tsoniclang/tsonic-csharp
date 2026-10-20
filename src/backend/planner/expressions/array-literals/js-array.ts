import type { CsharpPlanningContext } from "../../context.js";
import { AsArrayLiteralExpression, AsSpreadElement, HasSourceKind, KindSpreadElement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { plannedArrayElements } from "./dense-array.js";
import { planCsharpJsArraySpreadAppend } from "../sequence-conversions.js";
import { callStatic } from "../builders.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue } from "../planned-value-composition.js";

export function planJsArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef,
  collectionType: CsharpTypeNode,
  _elementType: CsharpTypeNode,
  elementTargetType: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpPlannedValue | undefined {
  const elements = AsArrayLiteralExpression(input.program.source.ast, node)!.Elements?.Nodes ?? [];
  if (!elements.some(element => HasSourceKind(input.program.source.ast, element, KindSpreadElement))) {
    const values = plannedArrayElements(elements, sourceFile, input, diagnostics, planner.planExpression);
    if (values === undefined) return undefined;
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, values, expressions => callStatic(collectionType, "of", [{
      kind: "CollectionExpression", elements: expressions.map(expression => ({ kind: "ExpressionElement", expression })),
    }]), carrier);
  }
  let result: CsharpPlannedValue = csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type: collectionType, arguments: [] });
  for (const element of elements) {
    if (element === undefined) {
      failCsharpPlannerInvariant("An admitted JS array literal requires its dense source element inventory.", node);
    }
    const spread = HasSourceKind(input.program.source.ast, element, KindSpreadElement);
    const operand = spread ? AsSpreadElement(input.program.source.ast, element)?.Expression : element;
    if (operand === undefined) {
      failCsharpPlannerInvariant("An admitted JS array spread requires its source expression.", element);
    }
    if (spread) {
      const appended = planCsharpJsArraySpreadAppend(element, operand, result, collectionType, elementTargetType,
        sourceFile, input, diagnostics, planner);
      if (appended === undefined) return undefined;
      result = appended;
      continue;
    }
    const expression = planner.planExpression(operand, sourceFile, input, diagnostics);
    if (expression === undefined) return undefined;
    const appended = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [result, expression], values => ({
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: values[0]!, name: "AppendElement" },
      arguments: [{ kind: "Argument", expression: values[1]! }],
    }), carrier);
    if (appended === undefined) return undefined;
    result = appended;
  }
  return result;
}
