import type { CsharpPlanningContext } from "../../context.js";
import { AsArrayLiteralExpression, AsSpreadElement, HasSourceKind, KindSpreadElement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planArrayLiteralExpression } from "./dense-array.js";
import { planArraySpreadSourceExpression } from "./spread-source.js";
import { arrayLiteralHasElision, rejectSparseArrayLiteralElision } from "./elision.js";
import { callStatic } from "../csharp-expression-builders.js";

export function planJsArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  collectionType: CsharpTypeNode,
  elementType: CsharpTypeNode,
  elementTargetType: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const elements = AsArrayLiteralExpression(input.program.source.ast, node)!.Elements?.Nodes ?? [];
  if (arrayLiteralHasElision(node, input)) return rejectSparseArrayLiteralElision(node, diagnostics);
  if (!elements.some(element => HasSourceKind(input.program.source.ast, element, KindSpreadElement))) {
    const array = planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, elementTargetType);
    if (array === undefined) return undefined;
    return array.kind === "ArrayCreationExpression"
      ? callStatic(collectionType, "of", [{ kind: "CollectionExpression",
        elements: array.elements.map(expression => ({ kind: "ExpressionElement", expression })) }])
      : { kind: "ObjectCreationExpression", type: collectionType, arguments: [{ kind: "Argument", expression: array }] };
  }
  let result: CsharpExpression = { kind: "ObjectCreationExpression", type: collectionType, arguments: [] };
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
    const expression = spread
      ? planArraySpreadSourceExpression(element, operand, sourceFile, input, diagnostics, elementType, elementTargetType, planner.planExpression)
      : planner.planExpressionWithExpectedType(operand, sourceFile, input, diagnostics, elementType, undefined, elementTargetType);
    if (expression === undefined) return undefined;
    result = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: result,
      name: spread ? "AppendSequence" : "AppendElement" }, arguments: [{ kind: "Argument", expression }] };
  }
  return result;
}
