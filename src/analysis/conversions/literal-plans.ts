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
    const selected = literals.recipe(request.expression);
    if (selected.kind !== "represented") return selected;
    const literal = selected.value.kind === "present" ? selected.value.value : undefined;
    if (literal === undefined && request.propertyKey === undefined) { producer.nonLiteral(request.expression); continue; }
    const role = request.propertyKey === undefined ? "value" : "property-key";
    if (producer.has(request.expression, request.target, role, request.source)) continue;
    producer.select(request.expression, request.target, role, request.source,
      request.propertyKey === undefined ? selectCsharpExactLiteralConversion(literal, request.source, request.target)
        : selectCsharpExactPropertyKeyConversion(request.propertyKey, request.target));
  }
  return Object.freeze({ kind: "represented", value: producer.seal() });
}
