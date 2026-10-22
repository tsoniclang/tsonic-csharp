import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";

export function nativeConstantConversion(conversion: CsharpConversionSelection): boolean {
  switch (conversion.kind) {
    case "identity":
      return true;
    case "implicit":
      return conversion.proof === "literal" || conversion.proof === "numeric" ||
        conversion.proof === "reference" || conversion.proof === "nullable";
    case "cast":
      return conversion.proof === "numeric" || conversion.proof === "reference" || conversion.proof === "nullable";
    default:
      return false;
  }
}
