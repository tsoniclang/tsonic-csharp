import type {
  CsharpPlanningContext } from "../../context.js";
import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindSpreadElement,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import {
  runtimeArrayHelperCall,
} from "../arrays/helpers.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";
import {
  planArraySpreadSourceExpression,
} from "./spread-source.js";

export function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(input.program.source.ast, node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.program.source.ast, element, KindSpreadElement))) {
    return planArraySpreadLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, elementTargetType);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, (element, elementSourceFile, elementInput, elementDiagnostics) =>
    planner.planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, elementType, undefined, elementTargetType));
  if (elements === undefined) {
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    elements,
  };
}

export function plannedArrayElements(
  elements: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined,
): readonly CsharpExpression[] | undefined {
  const planned: CsharpExpression[] = [];
  for (const element of elements) {
    if (element === undefined) {
      continue;
    }
    const expression = planExpression(element, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    planned.push(expression);
  }
  return planned;
}

function planArraySpreadLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, planner, elementTargetType);
  if (chunks === undefined) {
    return undefined;
  }
  if (chunks.length === 0) {
    return {
      kind: "ArrayCreationExpression",
      elementType,
      elements: [],
    };
  }
  if (chunks.length === 1 && chunks[0]?.fromSpread !== true) {
    return chunks[0]!.expression;
  }
  return runtimeArrayHelperCall("Concat", chunks.map((chunk) => ({ kind: "Argument", expression: chunk.expression })));
}

function createArraySpreadChunks(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): readonly { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] | undefined {
  const literal = AsArrayLiteralExpression(input.program.source.ast, node)!;
  const chunks: { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] = [];
  let pendingElements: CsharpExpression[] = [];
  const flushPending = () => {
    if (pendingElements.length === 0) {
      return;
    }
    chunks.push({
      expression: {
        kind: "ArrayCreationExpression",
        elementType,
        elements: pendingElements,
      },
    });
    pendingElements = [];
  };
  for (const element of literal.Elements?.Nodes ?? []) {
    if (element === undefined) {
      continue;
    }
    if (!HasSourceKind(input.program.source.ast, element, KindSpreadElement)) {
      const planned = planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType);
      if (planned === undefined) {
        return undefined;
      }
      pendingElements.push(planned);
      continue;
    }
    flushPending();
    const expression = AsSpreadElement(input.program.source.ast, element)?.Expression;
    if (expression === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a source expression."));
      return undefined;
    }
    const planned = planArraySpreadSourceExpression(
      element,
      expression,
      sourceFile,
      input,
      diagnostics,
      elementType,
      elementTargetType,
      planner.planExpression,
    );
    if (planned === undefined) {
      return undefined;
    }
    chunks.push({
      expression: planned,
      fromSpread: true,
    });
  }
  flushPending();
  return chunks;
}
