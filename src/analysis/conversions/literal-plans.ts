import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../policy/conversions/literals.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import { createCsharpExactLiteralProducer } from "../program/records/exact-literals.js";

export function analyzeCsharpExactLiteralSelections(
  literalValues: SourceLiteralIndex,
  requests: Iterable<CsharpExactLiteralRequest>,
  nodes: Iterable<Node>,
): CsharpExactLiteralSelectionIndex {
  const producer = createCsharpExactLiteralProducer();
  for (const node of nodes) {
    if (literalValues.literalValue.get(node) === undefined) producer.nonLiteral(node);
  }
  for (const request of requests) {
    const literal = literalValues.literalValue.get(request.expression);
    if (literal === undefined && request.propertyKey === undefined) continue;
    const role = request.propertyKey === undefined ? "value" : "property-key";
    if (producer.has(request.expression, request.target, role)) continue;
    producer.select(request.expression, request.target, role,
      request.propertyKey === undefined ? selectCsharpExactLiteralConversion(literal, request.target)
        : selectCsharpExactPropertyKeyConversion(request.propertyKey, request.target));
  }
  return producer.seal();
}
