import type { CsharpSourceProfileCallPolicyContext } from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  getCsharpJsArrayElementTargetType,
} from "../../../types/index.js";
import type { TargetTypeRef } from "../../../types/index.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../../target-model/types/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/runtime-carriers.js";

export interface CsharpArrayCopySelection {
  readonly method: "fromDense" | "CopyDense";
  readonly sourceType: TargetTypeRef;
  readonly typeArguments: readonly TargetTypeRef[];
}

export function selectCsharpArrayCopy(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpArrayCopySelection | undefined {
  const argument = context.source.sourceArguments[0];
  const sourceType = resolveCsharpSelectedSourceValue(context, argument);
  if (getCsharpRuntimeUnionArms(sourceType) !== undefined) {
    const element = csharpArrayLikeElement(sourceType);
    return argument !== undefined && element !== undefined
      ? { method: "CopyDense", sourceType: csharpArrayLikeTargetType(element), typeArguments: [element] } : undefined;
  }
  const element = getCsharpJsArrayElementTargetType(sourceType);
  if (argument === undefined || sourceType === undefined || element === undefined) return undefined;
  return { method: "fromDense", sourceType, typeArguments: [element] };
}
