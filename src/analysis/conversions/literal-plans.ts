import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../policy/conversions/literals.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import { createCsharpExactLiteralProducer } from "../program/records/operations/exact-literals.js";
import { coalesceCsharpExactLiteralRequests } from "./literal-requests.js";

export function analyzeCsharpExactLiteralSelections(
  facts: SourceProgramFacts,
  requests: Iterable<CsharpExactLiteralRequest>,
  nodes: Iterable<Node>,
): CsharpExactLiteralSelectionIndex {
  const producer = createCsharpExactLiteralProducer();
  for (const node of nodes) {
    if (facts.values.literal(node) === undefined) producer.nonLiteral(node);
  }
  for (const request of coalesceCsharpExactLiteralRequests(requests)) {
    const literal = facts.values.literal(request.expression);
    if (literal === undefined && request.propertyKey === undefined) continue;
    const role = request.propertyKey === undefined ? "value" : "property-key";
    if (producer.has(request.expression, request.target, role, request.source)) continue;
    producer.select(request.expression, request.target, role, request.source,
      request.propertyKey === undefined ? selectCsharpExactLiteralConversion(literal, request.source, request.target)
        : selectCsharpExactPropertyKeyConversion(request.propertyKey, request.target));
  }
  return producer.seal();
}
