import type { Node } from "@tsonic/tsts";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../../policy/model/memory.js";
import type { CsharpResolvedNativePointerOperation } from "../../../target-model/records/native/native-pointers.js";
import { represented } from "../../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpLayoutObservation } from "../../../policy/operations/pointers/layout-observations.js";
import { selectCsharpNativeMemoryFieldOffset, selectCsharpNativeMemoryLayout } from "./native-memory.js";

export function selectCsharpMemoryObservation(input: CsharpMemoryAnalysisHost, occurrence: Node):
  CsharpMemoryOutcome<Extract<CsharpResolvedNativePointerOperation, { readonly kind: "layout-query" }> | undefined> {
  const bindings = input.sourceStorage.bindingsForLexicalOwner(occurrence);
  if (bindings.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: bindings });
  if (bindings.kind === "unresolved") return bindings;
  const selected = input.sourceStorage.memory.observation.value(occurrence, bindings.bindings);
  if (selected.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: selected });
  if (selected.kind === "unresolved") return selected;
  if (selected.value.kind === "none") return represented(undefined);
  const source = selected.value.value;
  if (source.occurrence !== occurrence) throw new TypeError("A scoped memory observation requires its identical original occurrence.");
  const layout = selectCsharpNativeMemoryLayout(input, source.layout, source.typeBindings);
  if (layout.kind !== "represented") return layout;
  let fieldOffset: bigint | undefined;
  if (source.operation === "field-offset") {
    if (source.field.kind !== "present") throw new TypeError("A completed field-offset observation requires its canonical Source field.");
    const selected = selectCsharpNativeMemoryFieldOffset(input, source.layout, layout.value, source.field.value);
    if (selected.kind !== "represented") return selected;
    fieldOffset = selected.value;
  } else if (source.field.kind !== "none") {
    throw new TypeError("A non-field memory observation cannot publish a selected field.");
  }
  const result = input.representation.represent(source.result, "value", occurrence);
  if (result.kind !== "represented") return result;
  return selectCsharpLayoutObservation(source, layout.value, result.value.carrier, fieldOffset);
}
