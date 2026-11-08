import type { Node } from "@tsonic/tsts";
import type { CsharpNativeLiteralQueries } from "../../policy/model/native-literals.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../policy/conversions/literals.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import { createCsharpExactLiteralProducer } from "../program/records/operations/exact-literals.js";
import { coalesceCsharpExactLiteralRequests } from "./literal-requests.js";

export function analyzeCsharpExactLiteralSelections(
  literals: CsharpNativeLiteralQueries,
  requests: Iterable<CsharpExactLiteralRequest>,
  nodes: Iterable<Node>,
): CsharpRepresentationOutcome<CsharpExactLiteralSelectionIndex> {
  const producer = createCsharpExactLiteralProducer();
  for (const node of nodes) {
    if (!literals.hasRecipeSyntax(node)) producer.nonLiteral(node);
  }
  for (const request of coalesceCsharpExactLiteralRequests(requests)) {
    if (request.propertyKey !== undefined) {
      if (!producer.has(request.expression, request.target, "property-key", request.source)) producer.select(
        request.expression, request.target, "property-key", request.source,
        selectCsharpExactPropertyKeyConversion(request.propertyKey, request.target));
      continue;
    }
    const selected = literals.scalar(request.expression);
    if (selected.kind !== "represented") return selected;
    const literal = selected.value.kind === "present" ? selected.value.value : undefined;
    if (literal === undefined) { producer.nonLiteral(request.expression); continue; }
    if (producer.has(request.expression, request.target, "value", request.source)) continue;
    const recipe = literals.recipe(request.expression);
    if (recipe.kind !== "represented") return recipe;
    const conversion = selectCsharpExactLiteralConversion(literal, request.source, request.target);
    producer.select(request.expression, request.target, "value", request.source,
      recipe.value.kind === "none" && conversion.kind === "resolved"
        ? Object.freeze({ kind: "source-representation" }) : conversion);
  }
  return Object.freeze({ kind: "represented", value: producer.seal() });
}
