import type { SourceMemoryObservation } from "@tsonic/target-api/source";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpResolvedNativePointerOperation } from "../../../target-model/records/native/native-pointers.js";
import { csharpBigIntFitsSourcePrimitive } from "../../conversions/literal-range.js";
import { nativeRepresentationFailure, represented } from "../../types/source-type-flow/representation-results.js";

export function selectCsharpLayoutObservation(source: SourceMemoryObservation, layout: CsharpNativeMemoryLayout,
  resultType: TargetTypeRef, fieldOffset: bigint | undefined):
  CsharpRepresentationOutcome<Extract<CsharpResolvedNativePointerOperation, { readonly kind: "layout-query" }>> {
  const expected = source.operation === "size" ? layout.size : source.operation === "alignment" ? layout.alignment
    : source.operation === "stride" ? layout.valueStride : fieldOffset;
  if (layout.width !== source.layout.dataLayout.addressWidth || expected === undefined || expected !== source.value ||
    source.value < 0n || source.value > (1n << BigInt(layout.width)) - 1n) {
    return nativeRepresentationFailure(source.occurrence, "CSHARP_MEMORY_OBSERVATION_ABI_MISMATCH",
      "The finalized Source observation must equal its independently admitted Native dimensions under the same address width.");
  }
  if (resultType.kind !== "source-primitive" || resultType.name === "char" ||
    !csharpBigIntFitsSourcePrimitive(source.value, resultType.name) ||
    resultType.name === "native-int" && source.value > (1n << BigInt(layout.width - 1)) - 1n) {
    return nativeRepresentationFailure(source.occurrence, "CSHARP_MEMORY_OBSERVATION_RESULT_NOT_PROVEN",
      "The unchanged finalized observation must fit the actual admitted Native integer result carrier.");
  }
  return represented(Object.freeze({ kind: "layout-query", value: source.value, resultType }));
}
