import { createHash } from "node:crypto";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpRepresentationOutcome, CsharpSourceRoleImplementation } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceRoleEmission, CsharpSourceRoleEmissionRecords } from "../../target-model/records/types/source-roles.js";
import { csharpTargetNamedType } from "../../target-model/types/factories.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";
import { represented, nativeRepresentationFailure } from "../../policy/types/source-type-flow/representation-results.js";
import type { CsharpOptionalStorageLayout } from "../../target-model/types/projections.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTypeDefinitionRegistry } from "./type-definitions.js";
import { csharpTargetTypeFromBinding } from "../../policy/types/storage/bindings.js";

export interface CsharpSourceRoleRegistry {
  retain(implementation: CsharpSourceRoleImplementation, site: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  seal(): CsharpSourceRoleEmissionRecords;
}

export function createCsharpSourceRoleRegistry(
  providers: CsharpProviderRelationResolver,
  definitions: CsharpTypeDefinitionRegistry,
): CsharpSourceRoleRegistry {
  const records = new Map<string, CsharpSourceRoleEmission>();
  const budget = createCsharpMetadataBudget();
  let open = true;
  return Object.freeze({
    retain(implementation, site) {
      const mapping = implementation.valueToStorage.map(entry => entry.kind === "slot" ? entry.index : undefined);
      if (mapping.length !== implementation.valueSlots.length ||
        implementation.valueOptional !== undefined && implementation.storageOptional === undefined ||
        mapping.some((index, position) => index === undefined || !Number.isSafeInteger(index) || index < 0 ||
          implementation.storageSlots[index] === undefined ||
          !targetTypeRefEquals(implementation.storageSlots[index]!.carrier, implementation.valueSlots[position]!.carrier)) ||
        new Set(mapping).size !== mapping.length) failTargetAnalysisInvariant("tsonic-csharp",
          "A Source role implementation requires its complete exact immediate physical-slot correspondence.", site);
      const parameters = implementation.requirements;
      const identities = new Set(parameters.map(parameter => parameter.identity));
      if (identities.size !== parameters.length || [...csharpFreeTypeParameterIdentities([
        implementation.storage, implementation.value,
        ...implementation.storageOptional === undefined ? [] : [implementation.storageOptional.operations],
        ...implementation.valueOptional === undefined ? [] : [implementation.valueOptional.operations],
      ])].some(identity => !identities.has(identity))) failTargetAnalysisInvariant("tsonic-csharp",
        "A Source role implementation requires every original completed Native generic requirement.", site);
      const key = JSON.stringify([targetTypeRefKey(implementation.storage), targetTypeRefKey(implementation.value),
        implementation.storageSlots.map(slot => targetTypeRefKey(slot.carrier)),
        implementation.valueSlots.map(slot => targetTypeRefKey(slot.carrier)), mapping,
        optionalLayoutKey(implementation.storageOptional), optionalLayoutKey(implementation.valueOptional),
        parameters.map(parameter => targetTypeRefKey(parameter))]);
      const previous = records.get(key);
      if (previous !== undefined) return represented(previous.carrier);
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native Source role implementations cannot appear after their registry is sealed.", site);
      const selected = providers.findTargetBindingByMetadataName("Tsonic.CSharp.Runtime.ISourceUnionRole`2", "ordinary");
      if (selected.kind !== "resolved" || selected.binding.kind !== "interface" || selected.binding.typeParameters?.length !== 2) {
        return nativeRepresentationFailure(site, "CSHARP_SOURCE_ROLE_CONTRACT_MISSING",
          selected.kind === "rejected" ? selected.diagnostic.message :
            "A Source role witness requires the exact two-parameter Native ISourceUnionRole interface binding.");
      }
      const contract = csharpTargetTypeFromBinding(selected.binding, [implementation.storage, implementation.value]);
      if (contract?.kind !== "target-named") return nativeRepresentationFailure(site, "CSHARP_SOURCE_ROLE_CONTRACT_MISSING",
        "A Source role witness requires the actual represented Native ISourceUnionRole interface.");
      budget.reserve(1 + implementation.storageSlots.length + implementation.valueSlots.length + parameters.length);
      const name = `SourceRole_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
      const carrier = csharpTargetNamedType(`tsonic.source-role:${name}`, Object.freeze([...parameters]),
        { kind: "named", name }, { allowsRefLikeTypeArguments: parameters.map(() => false), valueType: true });
      const definition = definitions.retainGenerated({ carrier, kind: "struct", parameters, supertypes: Object.freeze([contract]) });
      const record: CsharpSourceRoleEmission = Object.freeze({ carrier: definition.carrier, interfaces: definition.supertypes, storage: implementation.storage,
        value: implementation.value, storageSlots: Object.freeze(implementation.storageSlots.map(slot => slot.carrier)),
        valueSlots: Object.freeze(implementation.valueSlots.map(slot => slot.carrier)),
        valueToStorage: Object.freeze(mapping as readonly number[]), storageOptional: implementation.storageOptional,
        valueOptional: implementation.valueOptional, parameters: Object.freeze([...parameters]), site });
      records.set(key, record);
      return represented(carrier);
    },
    seal() {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "The Native Source role registry seals exactly once.");
      open = false;
      const values = Object.freeze([...records.values()]);
      return Object.freeze({ sourceRoles: Object.freeze({ get: () => values }) });
    },
  });
}

function optionalLayoutKey(layout: CsharpOptionalStorageLayout | undefined): readonly string[] | undefined {
  return layout === undefined ? undefined : [targetTypeRefKey(layout.payload), targetTypeRefKey(layout.carrier), targetTypeRefKey(layout.operations)];
}
