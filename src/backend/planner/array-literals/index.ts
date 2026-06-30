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
  getCsharpArrayLiteralElementTargetType,
} from "../../../source/csharp-source-semantics/target-types.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../../source/csharp-source-semantics/surfaces/js/array-carriers.js";
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const carrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, carrier, planner, carrierResolution);
}

export function planArrayLiteralExpressionWithCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef | undefined,
  planner: ArrayLiteralPlanner,
  carrierResolution?: ReturnType<typeof resolveRuntimeCarrierForExpression>,
): CsharpExpression | undefined {
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if (carrier?.kind === "array") {
    const elementType = csharpTypeFromTargetTypeRef(carrier.element);
    if (elementType !== undefined) {
      return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, carrier.element);
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
  const detail = missingCarrierDiagnosticDetail(carrierResolution ?? resolveRuntimeCarrierForExpression(input, node, sourceFile), "Runtime carrier fact is missing for the array literal.");
  diagnostics.push(unsupportedNodeDiagnostic(node, `Array literal emission requires finalized TSTS/provider array runtime-carrier facts with array element type evidence before C# emission. ${detail.reason}`, detail.evidence));
  return undefined;
}
