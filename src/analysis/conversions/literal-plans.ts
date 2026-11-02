import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../policy/conversions/literals.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import { createCsharpExactLiteralProducer } from "../program/records/operations/exact-literals.js";

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
    producer.request(request);
  }
  for (const request of producer.requests()) {
    const literal = literalValues.literalValue.get(request.expression);
    const role = request.propertyKey === undefined ? "value" : "property-key";
    const source = request.propertyKey === undefined ? request.source : undefined;
    if (producer.has(request.expression, request.target, role, source)) continue;
    producer.select(request.expression, request.target, role, source,
      request.propertyKey === undefined ? selectCsharpExactLiteralConversion(literal, request.target, request.source)
        : selectCsharpExactPropertyKeyConversion(request.propertyKey, request.target));
  }
  return producer.seal();
}
