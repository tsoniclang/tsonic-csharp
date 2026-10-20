import type { TargetTypeRef } from "../../target-model/types/model.js";

import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

import { isCsharpNeverTargetType } from "../../target-model/types/carriers/scalar-types.js";

export function csharpVoidReturnCompletion(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): "void" | "absence" | undefined {
  if (!isCsharpVoidTargetType(source)) return undefined;
  if (isCsharpVoidTargetType(target)) return "void";
  return csharpCarrierAdmitsSourceAbsence(target) ? "absence" : undefined;
}

export function csharpArgumentVectorCallbackResultMatches(source: TargetTypeRef, target: TargetTypeRef): boolean {
  return targetTypeRefEquals(source, target) || isCsharpNeverTargetType(source) && isCsharpVoidTargetType(target);
}
