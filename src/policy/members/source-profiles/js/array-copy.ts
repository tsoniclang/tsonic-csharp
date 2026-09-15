import type { CsharpSourceProfileCallPolicyContext } from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  getCsharpJsArrayElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpRuntimeUndefinedTargetType,
  isCsharpValueTypeTargetType,
} from "../../../types/index.js";
import type { TargetTypeRef } from "../../../types/index.js";
import { isUndefinedType } from "../../../types/resolution/source-evidence.js";

export interface CsharpArrayCopySelection {
  readonly method: "fromDense" | "fromOptionalValue" | "fromOptionalReference" | "fromUndefined";
  readonly sourceType: TargetTypeRef;
  readonly typeArguments: readonly TargetTypeRef[];
}

export function selectCsharpArrayCopy(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpArrayCopySelection | undefined {
  const argument = context.source.sourceArguments[0];
  const sourceType = resolveCsharpSelectedSourceValue(context, argument);
  const element = getCsharpJsArrayElementTargetType(sourceType);
  if (argument === undefined || sourceType === undefined || element === undefined) return undefined;
  if (context.host.arrayDensity.array(argument.expression)) {
    return { method: "fromDense", sourceType, typeArguments: [element] };
  }
  const selection = context.source.sourceSelectedMethodTypeArguments?.[0];
  if (selection === undefined) return undefined;
  const queries = context.host.semantics(context.sourceFile);
  const members = queries.types.isUnion(selection.selectedType)
    ? queries.types.unionOrIntersectionTypes(selection.selectedType) : [selection.selectedType];
  const nullish = members.filter(member => queries.types.isNullish(member));
  if (nullish.length !== 1 || !isUndefinedType(nullish[0]!, queries)) return undefined;
  if (isCsharpRuntimeUndefinedTargetType(element)) {
    return { method: "fromUndefined", sourceType, typeArguments: [] };
  }
  const payload = getCsharpNullableElementTargetType(element);
  if (payload === undefined || payload.kind === "type-parameter") return undefined;
  return {
    method: isCsharpValueTypeTargetType(payload) ? "fromOptionalValue" : "fromOptionalReference",
    sourceType,
    typeArguments: [payload],
  };
}
