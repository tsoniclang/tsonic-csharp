import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindOmittedExpression,
  KindSpreadElement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { runtimeArrayHelperCall } from "./array-helpers.js";
import { getRuntimeCarrierForExpression, getTargetTypeRefForNode } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  csharpListTargetType,
  getCsharpArrayLiteralElementTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../source/csharp-source-semantics/surfaces/js/array-carriers.js";

interface ArrayLiteralPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
  ) => CsharpExpression | undefined;
}

export function planArrayLiteralExpressionFromFacts(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, carrier, planner);
}

export function planArrayLiteralExpressionWithCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  carrier: ReturnType<typeof getRuntimeCarrierForExpression>,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if (carrier?.kind === "array") {
    const elementType = csharpTypeFromTargetTypeRef(carrier.element);
    if (elementType !== undefined) {
      return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires a renderable provider element carrier type before C# emission."));
    return undefined;
  }
  const collectionElementCarrier = getCsharpArrayLiteralElementTargetType(carrier);
  if (carrier !== undefined && collectionElementCarrier !== undefined) {
    const collectionType = csharpTypeFromTargetTypeRef(carrier);
    const elementType = csharpTypeFromTargetTypeRef(collectionElementCarrier);
    if (collectionType === undefined || elementType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires renderable provider collection and element carrier types before C# emission."));
      return undefined;
    }
    if (isCsharpJsArrayCarrierTargetType(carrier)) {
      return planJsArrayLiteralExpression(node, sourceFile, input, diagnostics, collectionType, elementType, planner);
    }
    return planNativeCollectionArrayLiteralExpression(node, sourceFile, input, diagnostics, carrier, collectionElementCarrier, planner);
  }
  if (carrier?.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planner);
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires finalized TSTS/provider array runtime-carrier facts with array element type evidence before C# emission."));
  return undefined;
}

function planNativeCollectionArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef,
  elementCarrier: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  const elementType = csharpTypeFromTargetTypeRef(elementCarrier);
  const collectionType = csharpTypeFromTargetTypeRef(concreteDenseArrayLiteralCollectionType(carrier, elementCarrier));
  if (elementType === undefined || collectionType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires renderable provider collection and element carrier types before C# emission."));
    return undefined;
  }
  if (!(literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
    const arrayExpression = planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
    if (arrayExpression === undefined) {
      return undefined;
    }
    return {
      kind: "ObjectCreationExpression",
      type: collectionType,
      arguments: [{
        kind: "Argument",
        expression: arrayExpression,
      }],
    };
  }
  const chunks = createNativeCollectionSpreadChunks(node, sourceFile, input, diagnostics, elementCarrier, elementType, planner);
  if (chunks === undefined) {
    return undefined;
  }
  if (chunks.length === 0) {
    return {
      kind: "ObjectCreationExpression",
      type: collectionType,
      arguments: [{
        kind: "Argument",
        expression: { kind: "ArrayCreationExpression", elementType, elements: [] },
      }],
    };
  }
  return jsArrayHelperCall("concat", chunks.map((chunk) => ({ kind: "Argument", expression: chunk })));
}

function concreteDenseArrayLiteralCollectionType(
  carrier: TargetTypeRef,
  elementCarrier: TargetTypeRef,
): TargetTypeRef {
  return carrier.kind === "target-named" && carrier.id === "System.Collections.Generic.List`1"
    ? carrier
    : csharpListTargetType(elementCarrier);
}

function createNativeCollectionSpreadChunks(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementCarrier: TargetTypeRef,
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
    chunks.push({
      kind: "ArrayCreationExpression",
      elementType,
      elements: pendingElements,
    });
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
      continue;
    }
    const spreadCarrier = getTargetTypeRefForNode(input, expression, sourceFile);
    const spreadType = spreadCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(spreadCarrier);
    if (spreadType === undefined || !arraySpreadElementCarrierMatches(elementCarrier, spreadCarrier)) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "JS surface array spread requires a finalized provider collection carrier with matching element type before C# emission."));
      continue;
    }
    const planned = planner.planExpression(expression, sourceFile, input, diagnostics);
    if (planned === undefined) {
      return undefined;
    }
    chunks.push(planned);
  }
  flushPending();
  return chunks;
}

function arraySpreadElementCarrierMatches(
  expectedElement: TargetTypeRef,
  spreadCarrier: TargetTypeRef | undefined,
): boolean {
  if (spreadCarrier === undefined) {
    return false;
  }
  const actualElement = spreadCarrier.kind === "array"
    ? spreadCarrier.element
    : getCsharpArrayLiteralElementTargetType(spreadCarrier);
  const expectedType = csharpTypeFromTargetTypeRef(expectedElement);
  const actualType = actualElement === undefined ? undefined : csharpTypeFromTargetTypeRef(actualElement);
  return expectedType !== undefined && actualType !== undefined && sameCsharpType(expectedType, actualType);
}

function planJsArrayLiteralExpression(
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
      continue;
    }
    const spreadCarrier = getTargetTypeRefForNode(input, expression, sourceFile);
    if (!isCsharpJsArrayCarrierTargetType(spreadCarrier)) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "JS surface array spread requires a finalized JSArray carrier fact for the spread expression."));
      continue;
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

function jsArrayHelperCall(name: string, args: readonly { readonly kind: "Argument"; readonly expression: CsharpExpression }[]): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: {
        kind: "QualifiedName",
        left: {
          kind: "QualifiedName",
          left: {
            kind: "QualifiedName",
            left: { kind: "IdentifierName", name: "Tsonic" },
            name: "CSharp",
          },
          name: "Js",
        },
        name: "Array",
      },
      name,
    },
    arguments: args,
  };
}

export function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, planner.planExpression);
  if (elements === undefined) {
    return undefined;
  }
  return {
    kind: "TupleExpression",
    elements,
  };
}

export function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
    return planArraySpreadLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, (element, elementSourceFile, elementInput, elementDiagnostics) =>
    planner.planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, elementType));
  if (elements === undefined) {
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    elements,
  };
}

function arrayLiteralHasElision(
  node: Node,
  input: TargetCompileInput,
): boolean {
  const literal = AsArrayLiteralExpression(node);
  return (literal?.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindOmittedExpression));
}

function rejectSparseArrayLiteralElision(
  node: Node,
  diagnostics: TargetDiagnostic[],
): undefined {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Sparse array literal elisions require closed JSArray hole construction facts before C# emission; dense array carriers must not compact holes."));
  return undefined;
}

function planArraySpreadLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const expectedArrayType = { kind: "ArrayType", elementType } satisfies CsharpTypeNode;
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, expectedArrayType, planner);
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  expectedArrayType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): readonly { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] | undefined {
  const literal = AsArrayLiteralExpression(node)!;
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
      continue;
    }
    const spreadCarrier = getTargetTypeRefForNode(input, expression, sourceFile);
    const spreadType = spreadCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(spreadCarrier);
    if (spreadType !== undefined && sameCsharpType(spreadType, expectedArrayType)) {
      const planned = planner.planExpression(expression, sourceFile, input, diagnostics);
      if (planned === undefined) {
        return undefined;
      }
      chunks.push({
        expression: planned,
        fromSpread: true,
      });
      continue;
    }
    if (isCsharpJsArrayCarrierTargetType(spreadCarrier)) {
      const planned = planner.planExpression(expression, sourceFile, input, diagnostics);
      if (planned === undefined) {
        return undefined;
      }
      chunks.push({
        expression: {
          kind: "InvocationExpression",
          callee: {
            kind: "SimpleMemberAccessExpression",
            receiver: planned,
            name: "toArray",
          },
          arguments: [],
        },
        fromSpread: true,
      });
      continue;
    }
    if (spreadType === undefined || !sameCsharpType(spreadType, expectedArrayType)) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a finalized provider array carrier matching the target array element type before C# emission."));
      continue;
    }
  }
  flushPending();
  return chunks;
}

function plannedArrayElements(
  elements: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
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
