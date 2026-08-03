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
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpArrayLiteralConstructionTargetType,
} from "../../../policy/types/index.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  planArrayLiteralExpression,
} from "./dense-array.js";
import {
  planArraySpreadSourceExpression,
} from "./spread-source.js";

export function planNativeCollectionArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef,
  elementCarrier: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  const elementType = csharpTypeFromTargetTypeRef(elementCarrier);
  const constructionCarrier = getCsharpArrayLiteralConstructionTargetType(carrier);
  const collectionType = constructionCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(constructionCarrier);
  if (elementType === undefined || collectionType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires renderable provider collection element and array-literal construction type metadata before C# emission."));
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

function createNativeCollectionSpreadChunks(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
    const planned = planArraySpreadSourceExpression(
      element,
      expression,
      sourceFile,
      input,
      diagnostics,
      elementType,
      elementCarrier,
      planner.planExpression,
    );
    if (planned === undefined) {
      return undefined;
    }
    chunks.push(planned);
  }
  flushPending();
  return chunks;
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
