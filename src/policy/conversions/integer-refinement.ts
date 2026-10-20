import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpIntegerRangeIndex } from "../../target-model/records/integer-ranges.js";
import { csharpUnsignedIntegerCounterpart } from "../../target-model/conversions/integer-refinement.js";
import type { CsharpIntegerRefinementConversion } from "../../target-model/conversions/integer-refinement.js";

export function selectCsharpGuardedIntegerConversion(
  input: { readonly integerRanges: CsharpIntegerRangeIndex },
  expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
): CsharpIntegerRefinementConversion | undefined {
  return source?.kind === "source-primitive" && target?.kind === "source-primitive" &&
    csharpUnsignedIntegerCounterpart(source.name) === target.name && input.integerRanges.get(expression)
    ? { kind: "integer-refinement", source: source.name, target: target.name, proof: "nonnegative" } : undefined;
}
