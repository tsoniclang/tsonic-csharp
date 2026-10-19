import { sourceIntegerIsNonnegative } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpUnsignedIntegerCounterpart } from "../../target-model/conversions/integer-refinement.js";
import type { CsharpIntegerRefinementConversion } from "../../target-model/conversions/integer-refinement.js";

export function selectCsharpGuardedIntegerConversion(
  input: Pick<CsharpPolicyContext, "ast" | "navigation" | "sourceFacts">,
  expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
): CsharpIntegerRefinementConversion | undefined {
  return source?.kind === "source-primitive" && target?.kind === "source-primitive" &&
    csharpUnsignedIntegerCounterpart(source.name) === target.name &&
    sourceIntegerIsNonnegative(input, expression)
    ? { kind: "integer-refinement", source: source.name, target: target.name, proof: "nonnegative" } : undefined;
}
