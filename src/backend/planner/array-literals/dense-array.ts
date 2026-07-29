import type {
  CsharpTranslationContext } from "../../../translate/context/index.js";
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
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  runtimeArrayHelperCall,
} from "../array-helpers.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  sameCsharpType,
} from "../csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpCollectionUsesJsArraySemantics,
  getCsharpCollectionElementTargetType,
} from "../../../policy/types/index.js";
import {
  targetTypeRefEquals,
} from "../../../policy/types/index.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";
import {
  planTupleSpreadArrayExpression,
} from "./tuple-spread.js";

export function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expectedArrayType = { kind: "ArrayType", elementType } satisfies CsharpTypeNode;
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, expectedArrayType, planner, elementTargetType);
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  expectedArrayType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
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
      return undefined;
    }
    const spreadCarrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
    const spreadCarrier = probeCarrierFromResolution(spreadCarrierResolution);
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
    if (spreadCarrierElementMatchesTargetElement(spreadCarrier, elementTargetType, elementType)) {
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
    if (spreadCarrier?.kind === "tuple") {
      const planned = planTupleSpreadArrayExpression(element, expression, sourceFile, input, diagnostics, spreadCarrier, elementType, elementTargetType, planner.planExpression);
      if (planned === undefined) {
        return undefined;
      }
      chunks.push({
        expression: planned,
        fromSpread: true,
      });
      continue;
    }
    if (csharpCollectionUsesJsArraySemantics(spreadCarrier)) {
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
      const detail = spreadCarrier === undefined
        ? missingCarrierDiagnosticDetail(spreadCarrierResolution, "Runtime carrier fact is missing for the array spread expression.")
        : {
            reason: "Finalized spread carrier does not match the target array carrier.",
            evidence: [],
          };
      diagnostics.push(unsupportedNodeDiagnostic(element, `Array spread requires a finalized provider array carrier matching the target array element type before C# emission. ${detail.reason}`, detail.evidence));
      return undefined;
    }
  }
  flushPending();
  return chunks;
}

function spreadCarrierElementMatchesTargetElement(
  spreadCarrier: TargetTypeRef | undefined,
  elementTargetType: TargetTypeRef | undefined,
  elementType: CsharpTypeNode,
): boolean {
  const spreadElementTargetType = getCsharpCollectionElementTargetType(spreadCarrier);
  if (spreadElementTargetType === undefined) {
    return false;
  }
  if (elementTargetType !== undefined) {
    return targetTypeRefEquals(spreadElementTargetType, elementTargetType);
  }
  const spreadElementType = csharpTypeFromTargetTypeRef(spreadElementTargetType);
  return spreadElementType !== undefined && sameCsharpType(spreadElementType, elementType);
}
