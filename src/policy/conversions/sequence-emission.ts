import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpArraySpreadEmission } from "../../target-model/records/array-literals.js";
import { getCsharpIndexableLengthMemberName, getCsharpReadOnlyIndexableCollectionElementTargetType, csharpTupleElementMemberName } from "../../target-model/types/index.js";
import { csharpCollectionElementRead } from "../operations/collections/element-reads.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { selectCsharpTypeEmission } from "../types/resolution/type-emission.js";

export function selectCsharpSequenceEmission(carrier: TargetTypeRef, target: TargetTypeRef,
  elements: readonly { readonly carrier: TargetTypeRef; readonly conversion: CsharpConversionSelection | undefined }[] | undefined):
  { readonly kind: "resolved"; readonly value: CsharpArraySpreadEmission } | { readonly kind: "rejected"; readonly reason: string } {
  if (elements === undefined || !selectCsharpTypeEmission({ carrier }) || elements.some(element =>
    !selectCsharpTypeEmission({ carrier: element.carrier }) || element.conversion === undefined || !csharpConversionIsApplicable(element.conversion, "implicit")))
    return { kind: "rejected", reason: "Array spread requires an exact native sequence and sealed destination element conversions." };
  const read = csharpCollectionElementRead(carrier);
  if (read?.kind === "invalid") return { kind: "rejected", reason: read.reason };
  const lengthMember = getCsharpIndexableLengthMemberName(carrier);
  const identity = elements.every(element => element.conversion?.kind === "identity");
  return { kind: "resolved", value: Object.freeze({ carrier,
    elements: Object.freeze(elements.map(element => Object.freeze({ carrier: element.carrier, conversion: element.conversion! }))),
    lengthMember, nativeSpread: carrier.kind !== "tuple" && read?.kind !== "method" && identity,
    sequence: Object.freeze({ iteration: carrier.kind === "tuple" ? "tuple"
      : getCsharpReadOnlyIndexableCollectionElementTargetType(carrier) !== undefined && lengthMember !== undefined ? "indexed" : "enumerable",
      tupleMembers: Object.freeze(carrier.kind === "tuple" ? carrier.elements.map((_, index) => csharpTupleElementMemberName(index)) : []),
      bulkCopy: carrier.kind === "array" && elements[0]?.conversion?.kind === "identity",
      appendSequence: carrier.kind !== "tuple" && !isCsharpValueTypeTargetType(carrier) && read?.kind !== "method" && identity,
      resultCarrier: Object.freeze({ kind: "array" as const, element: target }) }) }) };
}
