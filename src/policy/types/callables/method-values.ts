import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { substituteTargetTypeParameters } from "../resolution/substitution.js";

import { getCsharpMethodValue, csharpMethodValueType } from "../../../target-model/types/method-values.js";
export function rebindCsharpMethodValueTypeParameters(
  type: TargetTypeRef, parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[],
): TargetTypeRef | undefined {
  const value = getCsharpMethodValue(type);
  if (value === undefined || value.typeParameters.length !== parameters.length) return undefined;
  const substitutions = new Map(value.typeParameters.map((identity, index) => [identity, parameters[index]!]));
  return csharpMethodValueType(value.owner, value.method, value.identity,
    substituteTargetTypeParameters(value.contract, substitutions), parameters.map(parameter => parameter.identity));
}
