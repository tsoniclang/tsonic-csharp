import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpListTargetType, csharpCollectionUsesJsArraySemantics, getCsharpIndexableLengthMemberName, getCsharpReadOnlyIndexableCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";

import type { CsharpArrayBindingCarrier } from "../../../target-model/types/carriers/binding-array-carrier.js";
export function resolveCsharpArrayBindingCarrier(
  sourceCarrier: TargetTypeRef | undefined,
): CsharpArrayBindingCarrier | undefined {
  if (sourceCarrier?.kind === "array") {
    return Object.freeze({
      kind: "array",
      carrier: sourceCarrier,
      element: sourceCarrier.element,
      lengthMember: "Length",
      restSlice: "runtime-array-helper",
      restCarrier: sourceCarrier,
    });
  }
  if (sourceCarrier?.kind === "tuple") {
    return sourceCarrier;
  }
  if (sourceCarrier === undefined) {
    return undefined;
  }
  const element = getCsharpReadOnlyIndexableCollectionElementTargetType(
    sourceCarrier,
  );
  const lengthMember = getCsharpIndexableLengthMemberName(sourceCarrier);
  if (element === undefined || lengthMember === undefined) {
    return undefined;
  }
  return csharpCollectionUsesJsArraySemantics(sourceCarrier)
    ? Object.freeze({
        kind: "array",
        carrier: sourceCarrier,
        element,
        lengthMember,
        restSlice: "instance-slice",
        restCarrier: sourceCarrier,
      })
    : Object.freeze({
        kind: "array",
        carrier: sourceCarrier,
        element,
        lengthMember,
        restSlice: "js-array-helper",
        restCarrier: csharpListTargetType(element),
      });
}

export function csharpArrayBindingProjectionTarget(
  carrier: CsharpArrayBindingCarrier | undefined,
  index: number,
  rest: boolean,
): TargetTypeRef | undefined {
  if (carrier === undefined || !Number.isSafeInteger(index) || index < 0) {
    return undefined;
  }
  if (carrier.kind === "array") {
    return rest ? carrier.restCarrier : carrier.element;
  }
  return rest
    ? Object.freeze({ kind: "tuple", elements: Object.freeze(carrier.elements.slice(index)) })
    : carrier.elements[index];
}
