import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpExceptionTargetType } from "../../target-model/types/index.js";
import { isCsharpThrowableType } from "../types/resolution/target-hierarchy.js";
import { selectCsharpConversion } from "./selection/core.js";
import { csharpConversionIsApplicable } from "../../target-model/conversions/selection.js";

export function selectCsharpProgramErrorCarrier(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "typeDefinitions" | "target">,
  source: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (source === undefined) return undefined;
  if (isCsharpThrowableType(input, source)) return source;
  const target = csharpExceptionTargetType();
  return csharpConversionIsApplicable(selectCsharpConversion(input, source, target, "implicit"), "implicit") ? target : undefined;
}
