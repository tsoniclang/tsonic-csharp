import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindSpreadElement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { runtimeArrayHelperCall } from "./array-helpers.js";
import { getRuntimeCarrierForExpression, getTargetTypeRefForNode } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";

interface ArrayLiteralPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
  ) => CsharpExpression;
}

export function planArrayLiteralExpressionFromFacts(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression {
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier?.kind === "array") {
    const elementType = csharpTypeFromTargetTypeRef(carrier.element);
    if (elementType !== undefined) {
      return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires a renderable provider element carrier type before C# emission."));
    return invalidExpression("array literal with unrenderable element carrier");
  }
  if (carrier?.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planner);
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires finalized TSTS/provider array or tuple runtime-carrier facts before C# emission."));
  return invalidExpression("array literal without runtime carrier");
}

export function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression {
  const literal = AsArrayLiteralExpression(node)!;
  return {
    kind: "TupleExpression",
    elements: (literal.Elements?.Nodes ?? [])
      .filter((element): element is Node => element !== undefined)
      .map((element) => planner.planExpression(element, sourceFile, input, diagnostics)),
  };
}

export function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): CsharpExpression {
  const literal = AsArrayLiteralExpression(node)!;
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
    return planArraySpreadLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner);
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    elements: (literal.Elements?.Nodes ?? [])
      .filter((element): element is Node => element !== undefined)
      .map((element) => planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType)),
  };
}

function planArraySpreadLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
): CsharpExpression {
  const expectedArrayType = { kind: "ArrayType", elementType } satisfies CsharpTypeNode;
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, expectedArrayType, planner);
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
): readonly { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] {
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
      pendingElements.push(planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType));
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
    if (spreadType === undefined || !sameCsharpType(spreadType, expectedArrayType)) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a finalized provider array carrier matching the target array element type before C# emission."));
      continue;
    }
    chunks.push({
      expression: planner.planExpression(expression, sourceFile, input, diagnostics),
      fromSpread: true,
    });
  }
  flushPending();
  return chunks;
}
