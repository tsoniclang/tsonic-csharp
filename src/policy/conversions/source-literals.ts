import type { SourceLiteralValue } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";

export function resolveCsharpSourceLiteralTargetType(
  literal: SourceLiteralValue | undefined,
): TargetTypeRef | undefined {
  const numeric = literal?.numeric;
  if (numeric === undefined) return literal?.number === undefined
    ? undefined : csharpSourcePrimitiveTargetType("float64");
  if (numeric.kind !== "authored" || numeric.token.negative && numeric.token.coefficient === 0n ||
    /[.eE]/u.test(numeric.token.decimalText)) return csharpSourcePrimitiveTargetType("float64");
  return csharpSourcePrimitiveTargetType("int64");
}
