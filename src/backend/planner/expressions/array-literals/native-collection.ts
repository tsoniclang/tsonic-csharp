import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { getCsharpArrayLiteralBuilder, getCsharpArrayLiteralConstructionTargetType } from "../../../../target-model/types/index.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planCsharpDenseSequenceConstruction } from "../sequence-conversions.js";

export function planNativeCollectionArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef,
  elementCarrier: TargetTypeRef,
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const elementType = csharpTypeFromTargetTypeRef(elementCarrier, input.scope.typeParameterNames);
  const constructionCarrier = getCsharpArrayLiteralConstructionTargetType(carrier);
  const collectionType = constructionCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(constructionCarrier, input.scope.typeParameterNames);
  const builder = getCsharpArrayLiteralBuilder(constructionCarrier);
  if (elementType === undefined || collectionType === undefined || builder === undefined ||
    typeof builder.capacityConstructor !== "boolean" || typeof builder.appendElementMethod !== "string" || builder.appendElementMethod.length === 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires renderable provider collection element and construction metadata."));
    return undefined;
  }
  return planCsharpDenseSequenceConstruction(node, sourceFile, input, diagnostics, elementType, elementCarrier, planner,
    { type: collectionType, builder });
}
