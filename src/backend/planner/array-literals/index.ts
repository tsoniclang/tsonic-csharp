import type {
  CsharpTranslationContext } from "../../../translate/context/index.js";
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
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpCollectionUsesJsArraySemantics,
  getCsharpArrayLiteralElementTargetType,
  getCsharpNullableElementTargetType,
} from "../../../policy/types/index.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";
import {
  planArrayLiteralExpression,
} from "./dense-array.js";
import {
  planTupleLiteralExpression,
} from "./tuple.js";
import {
  planNativeCollectionArrayLiteralExpression,
} from "./native-collection.js";
import {
  planJsArrayLiteralExpression,
} from "./js-array.js";

export type {
  ArrayLiteralPlanner,
} from "./types.js";
export {
  planArrayLiteralExpression,
} from "./dense-array.js";
export {
  planTupleLiteralExpression,
} from "./tuple.js";

export function planArrayLiteralExpressionFromFacts(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const carrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution) ??
    input.types.resolveNode(node, sourceFile);
  return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, carrier, planner, carrierResolution);
}

export function planArrayLiteralExpressionWithCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef | undefined,
  planner: ArrayLiteralPlanner,
  carrierResolution?: ReturnType<typeof resolveRuntimeCarrierForExpression>,
): CsharpExpression | undefined {
  const constructionCarrier = getCsharpNullableElementTargetType(carrier) ??
    carrier;
  if (
    arrayLiteralHasElision(node, input) &&
    !csharpCollectionUsesJsArraySemantics(constructionCarrier)
  ) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if (constructionCarrier?.kind === "array") {
    const elementType = csharpTypeFromTargetTypeRef(constructionCarrier.element);
    if (elementType !== undefined) {
      return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, constructionCarrier.element);
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires a renderable provider element carrier type before C# emission."));
    return undefined;
  }
  const collectionElementCarrier = getCsharpArrayLiteralElementTargetType(
    constructionCarrier,
  );
  if (constructionCarrier !== undefined && collectionElementCarrier !== undefined) {
    const collectionType = csharpTypeFromTargetTypeRef(constructionCarrier);
    const elementType = csharpTypeFromTargetTypeRef(collectionElementCarrier);
    if (collectionType === undefined || elementType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires renderable provider collection and element carrier types before C# emission."));
      return undefined;
    }
    if (csharpCollectionUsesJsArraySemantics(constructionCarrier)) {
      return planJsArrayLiteralExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        collectionType,
        elementType,
        collectionElementCarrier,
        planner,
      );
    }
    return planNativeCollectionArrayLiteralExpression(node, sourceFile, input, diagnostics, constructionCarrier, collectionElementCarrier, planner);
  }
  if (constructionCarrier?.kind === "tuple") {
    return planTupleLiteralExpression(
      node,
      sourceFile,
      input,
      diagnostics,
      planner,
      csharpTypeFromTargetTypeRef(constructionCarrier),
      constructionCarrier,
    );
  }
  const detail = missingCarrierDiagnosticDetail(carrierResolution ?? resolveRuntimeCarrierForExpression(input, node, sourceFile), "Runtime carrier fact is missing for the array literal.");
  diagnostics.push(unsupportedNodeDiagnostic(node, `Array literal emission requires finalized TSTS/provider array runtime-carrier facts with array element type evidence before C# emission. ${detail.reason}`, detail.evidence));
  return undefined;
}
