import {
  AsArrayLiteralExpression,
  AsSpreadElement,
  HasSourceKind,
  KindSpreadElement,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
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
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  sameCsharpType,
} from "../csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpListTargetType,
  getCsharpArrayLiteralElementTargetType,
} from "../../../source/csharp-source-semantics/target-types.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  planArrayLiteralExpression,
} from "./dense-array.js";

export function planNativeCollectionArrayLiteralExpression(
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
      return undefined;
    }
    const spreadCarrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
    const spreadCarrier = probeCarrierFromResolution(spreadCarrierResolution);
    const spreadType = spreadCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(spreadCarrier);
    if (spreadType === undefined || !arraySpreadElementCarrierMatches(elementCarrier, spreadCarrier)) {
      const detail = spreadCarrier === undefined
        ? missingCarrierDiagnosticDetail(spreadCarrierResolution, "Runtime carrier fact is missing for the array spread expression.")
        : {
            reason: "Finalized spread carrier element type does not match the target collection element type.",
            evidence: [],
          };
      diagnostics.push(unsupportedNodeDiagnostic(element, `JS surface array spread requires a finalized provider collection carrier with matching element type before C# emission. ${detail.reason}`, detail.evidence));
      return undefined;
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
