import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpListTargetType,
  csharpCollectionUsesJsArraySemantics,
  getCsharpIndexableLengthMemberName,
  getCsharpReadOnlyIndexableCollectionElementTargetType,
} from "../collections.js";

export type CsharpArrayBindingCarrier =
  | {
      readonly kind: "array";
      readonly carrier: TargetTypeRef;
      readonly element: TargetTypeRef;
      readonly lengthMember: string;
      readonly restSlice:
        | "runtime-array-helper"
        | "instance-slice"
        | "js-array-helper";
      readonly restCarrier: TargetTypeRef;
    }
  | {
      readonly kind: "tuple";
      readonly elements: readonly TargetTypeRef[];
    };

export function resolveCsharpArrayBindingCarrier(
  sourceCarrier: TargetTypeRef | undefined,
): CsharpArrayBindingCarrier | undefined {
  if (sourceCarrier?.kind === "array") {
    return {
      kind: "array",
      carrier: sourceCarrier,
      element: sourceCarrier.element,
      lengthMember: "Length",
      restSlice: "runtime-array-helper",
      restCarrier: sourceCarrier,
    };
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
    ? {
        kind: "array",
        carrier: sourceCarrier,
        element,
        lengthMember,
        restSlice: "instance-slice",
        restCarrier: sourceCarrier,
      }
    : {
        kind: "array",
        carrier: sourceCarrier,
        element,
        lengthMember,
        restSlice: "js-array-helper",
        restCarrier: csharpListTargetType(element),
      };
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
    ? { kind: "tuple", elements: carrier.elements.slice(index) }
    : carrier.elements[index];
}
