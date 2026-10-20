import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../resolution/substitution.js";
import { snapshotCsharpTargetTypes } from "../../../target-model/types/snapshot.js";

import { csharpSourceUnionIdentity, type CsharpSourceUnionDefinition } from "../../../target-model/types/source-union-definitions.js";
export function instantiateCsharpSourceUnionArms(
  definition: CsharpSourceUnionDefinition, carrier: TargetTypeRef,
): readonly TargetTypeRef[] | undefined {
  const identity = csharpSourceUnionIdentity(carrier);
  if (identity === undefined || identity !== csharpSourceUnionIdentity(definition.carrier)) return undefined;
  const parameters = definition.carrier.typeArguments ?? [];
  const identities = new Set(parameters.flatMap(parameter => parameter.kind === "type-parameter" ? [parameter.identity] : []));
  const bindings = inferCsharpTargetTypeParameterBindings(definition.carrier, carrier, identities);
  return bindings === undefined ? undefined
    : snapshotCsharpTargetTypes(definition.arms.map(arm => substituteTargetTypeParameters(arm, bindings)));
}
