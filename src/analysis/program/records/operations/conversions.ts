import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { CsharpConversionMode } from "../../../../target-model/conversions/selection.js";
import { csharpUnavailableConversion, type CsharpConversionClassifications, type CsharpConversionPublication } from "../../../../target-model/records/operations/conversions.js";

export function sealCsharpConversionClassifications(input: CsharpConversionPublication): CsharpConversionClassifications {
  const pairs = new Map(input.pairSelections);
  const expressions = new WeakMap([...input.expressionSelections].map(([node, selections]) =>
    [node, new Map(selections)] as const));
  return Object.freeze({
    delegateContract: input.delegateContract,
    propertyProjectionRoots: Object.freeze([...input.propertyProjectionRoots]),
    generatedHelpers: input.generatedHelpers,
    generatedHelper: input.generatedHelper,
    issues: Object.freeze([...input.issues]),
    propertyProjection: input.propertyProjection,
    delegateAdapters: input.delegateAdapters,
    directCallableReference: input.directCallableReference,
    delegateAdapter: Object.freeze({ get: (expression: Node, source: TargetTypeRef, target: TargetTypeRef) =>
      expressions.get(expression)?.get(csharpConversionKey(source, target, "implicit"))?.delegateIdentity }),
    conversion: Object.freeze({ get(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) {
      return source === undefined || target === undefined ? csharpUnavailableConversion
        : pairs.get(csharpConversionKey(source, target, mode));
    } }),
    expressionConversion: Object.freeze({ get(expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) {
      return source === undefined || target === undefined ? csharpUnavailableConversion
        : expressions.get(expression)?.get(csharpConversionKey(source, target, mode))?.selection;
    } }),
  });
}

export function csharpConversionKey(source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode): string {
  const sourceKey = targetTypeRefKey(source);
  const targetKey = targetTypeRefKey(target);
  return mode + ":" + sourceKey.length + ":" + sourceKey + targetKey.length + ":" + targetKey;
}
