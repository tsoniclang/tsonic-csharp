import { sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat, type SourceLiteralUnit } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpBigIntFitsSourcePrimitive } from "../../conversions/literal-range.js";
import { csharpScalarLiteralIsRepresentableAs } from "../../conversions/literals.js";
import { sourcePrimitiveImplicitlyConverts } from "../../conversions/source-primitives.js";

export interface CsharpNumericArrayContribution {
  readonly carrier: TargetTypeRef;
  readonly literal: SourceLiteralUnit | undefined;
}

export function csharpArrayElementIsRepresentableAs(
  candidate: TargetTypeRef,
  contribution: CsharpNumericArrayContribution,
): boolean {
  const { carrier, literal } = contribution;
  const numeric = literal?.kind === "number" && literal.value.kind === "authored" ? literal.value : undefined;
  const integerLiteral = numeric !== undefined && numeric.token.exponent >= 0n &&
    !(numeric.token.negative && numeric.token.coefficient === 0n);
  if (integerLiteral && candidate.kind === "source-primitive" &&
    (candidate.name === "float32" || candidate.name === "float64") && numeric !== undefined &&
    !sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat(numeric.token, candidate.name)) return false;
  if (targetTypeRefEquals(candidate, carrier)) return true;
  if (numeric !== undefined && literal !== undefined) {
    if (isCsharpIntegralTargetType(candidate) && !(numeric.token.negative && numeric.token.coefficient === 0n) &&
      csharpScalarLiteralIsRepresentableAs(literal, candidate)) return true;
    if (candidate.kind === "source-primitive" && candidate.name === "float32" &&
      sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat(numeric.token, "float32")) return true;
  }
  if (!sourcePrimitiveImplicitlyConverts(candidate, carrier)) return false;
  if (candidate.kind === "source-primitive" && (candidate.name === "float32" || candidate.name === "float64") &&
    isCsharpIntegralTargetType(carrier) && carrier.kind === "source-primitive") {
    const precision = candidate.name === "float32" ? 24n : 53n;
    return carrier.name === "char" || !csharpBigIntFitsSourcePrimitive((1n << precision) + 1n, carrier.name);
  }
  return true;
}
