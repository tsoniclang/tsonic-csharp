import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { selectCsharpExactLiteralConversion } from "../../policy/conversions/literals.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpExactLiteralRequest,
  CsharpExactLiteralSelection,
  CsharpExactLiteralSelectionIndex,
} from "../../target-model/conversions/exact-literals.js";

const intrinsicRequest = "";
const notALiteral: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });

export function analyzeCsharpExactLiteralSelections(
  literalValues: SourceLiteralIndex,
  requests: Iterable<CsharpExactLiteralRequest>,
): CsharpExactLiteralSelectionIndex {
  const selections = new Map<Node, Map<string, CsharpExactLiteralSelection>>();
  for (const request of requests) {
    const literal = literalValues.literalValue.get(request.expression);
    if (literal === undefined) continue;
    const key = requestKey(request.target);
    let byTarget = selections.get(request.expression);
    if (byTarget === undefined) {
      byTarget = new Map();
      selections.set(request.expression, byTarget);
    }
    if (byTarget.has(key)) continue;
    byTarget.set(key, selectCsharpExactLiteralConversion(literal, request.target));
  }
  return Object.freeze({
    exactLiteral: Object.freeze({
      get: (expression: Node, target: TargetTypeRef | undefined) =>
        literalValues.literalValue.get(expression) === undefined
          ? notALiteral
          : selections.get(expression)?.get(requestKey(target)),
    }),
  });
}

function requestKey(target: TargetTypeRef | undefined): string {
  return target === undefined ? intrinsicRequest : targetTypeRefKey(target);
}
