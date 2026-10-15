import type { CsharpNativeCompletion } from "../../../target-model/records/native-demand.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { isCsharpNeverTargetType } from "../../../target-model/types/carriers/scalar-types.js";

export function csharpNativeCarrierCompletion(carrier: TargetTypeRef | undefined): CsharpNativeCompletion | undefined {
  if (carrier === undefined) return undefined;
  if (isCsharpNeverTargetType(carrier)) return Object.freeze({ kind: "never" as const, carrier });
  if (isCsharpVoidTargetType(carrier)) return Object.freeze({ kind: "void" as const, carrier });
  return Object.freeze({ kind: "value" as const, carrier });
}

export function csharpNativeOrderedCompletion(
  children: readonly (CsharpNativeCompletion | undefined)[],
  own: CsharpNativeCompletion | undefined,
): CsharpNativeCompletion | undefined {
  return children.find(child => child?.kind === "never") ?? own;
}
