import type { CsharpConversionSelection, CsharpConversionMode } from "../../target-model/conversions/selection.js";
export function csharpConversionIsApplicable(
  selection: CsharpConversionSelection,
  mode: CsharpConversionMode,
): boolean {
  if (selection.kind === "nullable-map") return csharpConversionIsApplicable(selection.conversion, mode);
  return selection.kind === "identity" ||
    selection.kind === "absence" ||
    selection.kind === "union-map" && (selection.coverage === "source" || mode === "explicit") ||
    selection.kind === "never" ||
    selection.kind === "checked-native-integer" ||
    selection.kind === "exact-integer" ||
    selection.kind === "integer-refinement" ||
    selection.kind === "integer-truncation" ||
    selection.kind === "array-like-union" ||
    selection.kind === "runtime-union-reference" ||
    selection.kind === "empty-record" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter" ||
    selection.kind === "provider-argument-adapter" ||
    selection.kind === "lifted-provider-argument-adapter" ||
    selection.kind === "nullable-value" ||
    selection.kind === "nullable-reference" ||
    selection.kind === "runtime-union-projection" ||
    selection.kind === "js-value-box" ||
    selection.kind === "js-value-cast" ||
    mode === "explicit" && selection.kind === "cast";
}
