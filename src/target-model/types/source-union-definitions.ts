import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpTargetNamedType } from "./factories.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "./substitution.js";
import { snapshotCsharpTargetTypes } from "./snapshot.js";
import { csharpMetadataDescriptors } from "../metadata/immutable.js";

export interface CsharpSourceUnionDefinition {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly arms: readonly TargetTypeRef[];
}

export interface CsharpTypeDefinitions {
  sourceUnionArms(carrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
  sourceUnions(): readonly CsharpSourceUnionDefinition[];
}

export interface CsharpTypeDefinitionWriter extends CsharpTypeDefinitions {
  registerSourceUnion(definition: CsharpSourceUnionDefinition): boolean;
}

export function snapshotCsharpSourceUnionDefinition(value: CsharpSourceUnionDefinition): CsharpSourceUnionDefinition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("A C# source union requires a data record.");
  const fields = csharpMetadataDescriptors(value);
  const carrier = fields.carrier?.value as TargetTypeRef | undefined;
  const arms: unknown = fields.arms?.value;
  if (Object.keys(fields).length !== 2 || carrier === undefined || !Array.isArray(arms) ||
    arms.length < 1 || arms.length > 8) throw new TypeError("A C# source union requires one carrier and one to eight arms.");
  const slots = csharpMetadataDescriptors(arms);
  if (Object.keys(slots).length !== arms.length + 1) throw new TypeError("C# source union arms must be dense.");
  const types = [carrier];
  for (let index = 0; index < arms.length; index += 1) {
    const slot = slots[String(index)];
    if (slot === undefined) throw new TypeError("C# source union arms must be dense.");
    types.push(slot.value as TargetTypeRef);
  }
  const snapshot = snapshotCsharpTargetTypes(types);
  if (snapshot[0]?.kind !== "target-named") throw new TypeError("A C# source union requires a named carrier.");
  return Object.freeze({ carrier: snapshot[0], arms: Object.freeze(snapshot.slice(1)) });
}

export const emptyCsharpTypeDefinitions: CsharpTypeDefinitions = Object.freeze({
  sourceUnionArms: () => undefined,
  sourceUnions: () => Object.freeze([]),
});

export function csharpSourceUnionTargetType(
  identity: string, name: string, arguments_: readonly TargetTypeRef[],
): CsharpTargetNamedTypeRef {
  return Object.freeze({
    ...csharpTargetNamedType(`csharp.source-union:${identity}`, Object.freeze([...arguments_]),
      { kind: "named", name, genericArity: arguments_.length }, { valueType: true }),
    csharpSourceUnionIdentity: identity,
  });
}

export function csharpSourceUnionIdentity(carrier: TargetTypeRef | undefined): string | undefined {
  if (carrier === undefined || carrier === null || typeof carrier !== "object" || carrier.kind !== "target-named") return undefined;
  const identity = (carrier as CsharpTargetNamedTypeRef).csharpSourceUnionIdentity;
  return typeof identity === "string" && identity.length > 0 && carrier.id === `csharp.source-union:${identity}`
    ? identity : undefined;
}

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
