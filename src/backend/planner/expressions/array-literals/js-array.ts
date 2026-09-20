import type { CsharpPlanningContext } from "../../context.js";
import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindOmittedExpression,
  KindSpreadElement,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  planArrayLiteralExpression,
} from "./dense-array.js";
import {
  planArraySpreadSourceExpression,
} from "./spread-source.js";

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
  const literal = AsArrayLiteralExpression(input.program.source.ast, node)!;
  const elements = literal.Elements?.Nodes ?? [];
  const hasSpread = elements.some((element) => HasSourceKind(input.program.source.ast, element, KindSpreadElement));
  const hasElision = elements.some((element) => HasSourceKind(input.program.source.ast, element, KindOmittedExpression));
  if (hasElision) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Sparse array literals are not supported by native dense arrays; use explicit undefined elements."));
    return undefined;
  }
  if (!hasSpread) {
    const arrayExpression = planArrayLiteralExpression(
      node,
      sourceFile,
      input,
      diagnostics,
      elementType,
      planner,
      elementTargetType,
    );
    return arrayExpression === undefined ? undefined : jsArrayFromNativeArray(arrayExpression, collectionType);
  }
  const chunks = createJsArrayLiteralChunks(
    node,
    sourceFile,
    input,
    diagnostics,
    collectionType,
    elementType,
    elementTargetType,
    planner,
  );
  if (chunks === undefined) {
    return undefined;
  }
  if (chunks.length === 0) {
    return jsArrayFromNativeArray({ kind: "ArrayCreationExpression", elementType, elements: [] }, collectionType);
  }
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: chunks[0]!,
      name: "concat",
    },
    arguments: chunks.slice(1).map((chunk) => ({
      kind: "Argument",
      expression: chunk,
    })),
  };
}

function createJsArrayLiteralChunks(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  collectionType: CsharpTypeNode,
  elementType: CsharpTypeNode,
  elementTargetType: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): readonly CsharpExpression[] | undefined {
  const literal = AsArrayLiteralExpression(input.program.source.ast, node)!;
  const chunks: CsharpExpression[] = [];
  let pendingElements: CsharpExpression[] = [];
  const flushPending = () => {
    if (pendingElements.length === 0) {
      return;
    }
    chunks.push(jsArrayFromNativeArray({ kind: "ArrayCreationExpression", elementType, elements: pendingElements }, collectionType));
    pendingElements = [];
  };
  for (const element of literal.Elements?.Nodes ?? []) {
    if (element === undefined) {
      continue;
    }
    if (!HasSourceKind(input.program.source.ast, element, KindSpreadElement)) {
      const planned = planner.planExpressionWithExpectedType(
        element,
        sourceFile,
        input,
        diagnostics,
        elementType,
        undefined,
        elementTargetType,
      );
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
      kind: "ObjectCreationExpression",
      type: collectionType,
      arguments: [{
        kind: "Argument",
        expression: planned,
      }],
    });
  }
  flushPending();
  return chunks;
}

function jsArrayFromNativeArray(arrayExpression: CsharpExpression, collectionType: CsharpTypeNode): CsharpExpression {
  return {
    kind: "ObjectCreationExpression",
    type: collectionType,
    arguments: [{
      kind: "Argument",
      expression: arrayExpression,
    }],
  };
}
