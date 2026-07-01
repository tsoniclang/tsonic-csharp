import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindSpreadElement,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../runtime-carriers.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../../source/csharp-source-semantics/surfaces/js/array-carriers.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  planArrayLiteralExpression,
} from "./dense-array.js";

export function planJsArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  collectionType: CsharpTypeNode,
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (!(literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
    const arrayExpression = planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
    return arrayExpression === undefined ? undefined : jsArrayFromNativeArray(arrayExpression, collectionType);
  }
  const chunks = createJsArrayLiteralChunks(node, sourceFile, input, diagnostics, collectionType, elementType, planner);
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  collectionType: CsharpTypeNode,
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): readonly CsharpExpression[] | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  const chunks: CsharpExpression[] = [];
  let pendingElements: CsharpExpression[] = [];
  const flushPending = () => {
    if (pendingElements.length === 0) {
      return;
    }
    chunks.push(jsArrayFromNativeArray({
      kind: "ArrayCreationExpression",
      elementType,
      elements: pendingElements,
    }, collectionType));
    pendingElements = [];
  };
  for (const element of literal.Elements?.Nodes ?? []) {
    if (element === undefined) {
      continue;
    }
    if (!HasSourceKind(input.ast, element, KindSpreadElement)) {
      const planned = planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType);
      if (planned === undefined) {
        return undefined;
      }
      pendingElements.push(planned);
      continue;
    }
    flushPending();
    const expression = AsSpreadElement(element)?.Expression;
    if (expression === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a source expression."));
      return undefined;
    }
    const spreadCarrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
    const spreadCarrier = probeCarrierFromResolution(spreadCarrierResolution);
    if (!isCsharpJsArrayCarrierTargetType(spreadCarrier)) {
      const detail = missingCarrierDiagnosticDetail(spreadCarrierResolution, "Runtime carrier fact is missing for the JS array spread expression.");
      diagnostics.push(unsupportedNodeDiagnostic(element, `JS surface array spread requires a finalized JSArray carrier fact for the spread expression. ${detail.reason}`, detail.evidence));
      return undefined;
    }
    const planned = planner.planExpression(expression, sourceFile, input, diagnostics);
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
