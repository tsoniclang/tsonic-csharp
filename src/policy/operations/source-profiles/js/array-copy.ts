import type { CsharpSourceProfileCallPolicyContext } from "../../../model/source-profiles.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { getCsharpJsArrayElementTargetType } from "../../../../target-model/types/index.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpArrayLikeElement } from "../../../../target-model/types/carriers/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpConversion } from "../../../conversions/core.js";
import { csharpConversionIsApplicable } from "../../../conversions/applicability.js";

type CsharpArrayCopyInvocation = Extract<
  NonNullable<CsharpTargetMember["csharpInvocation"]>,
  { readonly kind: "array-copy" }
>;

export type CsharpArrayCopySelection =
  | {
      readonly kind: "dense";
      readonly method: "fromDense";
      readonly sourceType: TargetTypeRef;
      readonly typeArguments: readonly TargetTypeRef[];
    }
  | { readonly kind: "union" } & Pick<CsharpArrayCopyInvocation,
      "sourceType" | "resultType" | "targetElementType" | "arms">;

export function selectCsharpArrayCopy(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpArrayCopySelection | undefined {
  const argument = context.source.sourceArguments[0];
  const sourceType = resolveCsharpSelectedSourceValue(context, argument);
  const sourceArms = getCsharpRuntimeUnionArms(sourceType, context.host.typeDefinitions);
  if (sourceArms !== undefined) {
    if (sourceType === undefined || context.source.sourceArguments.length !== 1 ||
      context.source.sourceSelectedSignatureParameters.length !== 1) return undefined;
    const resultType = context.inputs.results.get(context.source.call);
    const targetElementType = getCsharpJsArrayElementTargetType(resultType);
    if (resultType === undefined || targetElementType === undefined) return undefined;
    const arms: CsharpArrayCopyInvocation["arms"][number][] = [];
    for (const arm of sourceArms) {
      const sourceElementType = csharpArrayLikeElement(arm, context.host.typeDefinitions);
      if (sourceElementType === undefined) return undefined;
      const conversion = selectCsharpConversion(context.host, sourceElementType, targetElementType, "implicit");
      if (!csharpConversionIsApplicable(conversion, "implicit") ||
        conversion.kind !== "identity" && (conversion.kind !== "implicit" ||
        conversion.proof !== "numeric")) return undefined;
      arms.push(Object.freeze({ sourceType: arm, sourceElementType, conversion }));
    }
    return Object.freeze({ kind: "union", sourceType, resultType, targetElementType,
      arms: Object.freeze(arms) });
  }
  const element = getCsharpJsArrayElementTargetType(sourceType);
  if (argument === undefined || sourceType === undefined || element === undefined) return undefined;
  return { kind: "dense", method: "fromDense", sourceType, typeArguments: [element] };
}
