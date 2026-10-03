import type { CsharpPlanningContext } from "../../context.js";
import { AsArrayLiteralExpression, AsSpreadElement, HasSourceKind, KindSpreadElement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planArrayLiteralExpression } from "./dense-array.js";
import { planCsharpJsArraySpreadAppend } from "../sequence-conversions.js";
import { arrayLiteralHasElision, rejectSparseArrayLiteralElision } from "./elision.js";
import { callStatic } from "../csharp-expression-builders.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "../planned-value-composition.js";

export function planJsArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  collectionType: CsharpTypeNode,
  elementType: CsharpTypeNode,
  elementTargetType: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpPlannedValue | undefined {
  const elements = AsArrayLiteralExpression(input.program.source.ast, node)!.Elements?.Nodes ?? [];
  if (arrayLiteralHasElision(node, input)) return rejectSparseArrayLiteralElision(node, diagnostics);
  if (!elements.some(element => HasSourceKind(input.program.source.ast, element, KindSpreadElement))) {
    const array = planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, elementTargetType);
    if (array === undefined) return undefined;
    return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, array, value => value.kind === "ArrayCreationExpression"
      ? callStatic(collectionType, "of", [{ kind: "CollectionExpression",
        elements: value.elements.map(expression => ({ kind: "ExpressionElement", expression })) }])
      : { kind: "ObjectCreationExpression", type: collectionType, arguments: [{ kind: "Argument", expression: value }] });
  }
  const carrier = input.types.classifications.resolveNode(node, sourceFile);
  if (carrier === undefined) return undefined;
  let result: CsharpPlannedValue = csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type: collectionType, arguments: [] });
  for (const element of elements) {
    if (element === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal contains an undefined source element."));
      return undefined;
    }
    const spread = HasSourceKind(input.program.source.ast, element, KindSpreadElement);
    const operand = spread ? AsSpreadElement(input.program.source.ast, element)?.Expression : element;
    if (operand === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a source expression."));
      return undefined;
    }
    if (spread) {
      const appended = planCsharpJsArraySpreadAppend(element, operand, result, collectionType, elementTargetType,
        sourceFile, input, diagnostics, planner);
      if (appended === undefined) return undefined;
      result = appended;
      continue;
    }
    const expression = planner.planExpressionWithExpectedType(operand, sourceFile, input, diagnostics, elementType, undefined, elementTargetType);
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
