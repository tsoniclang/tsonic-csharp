import type { Node } from "@tsonic/tsts";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView, CsharpSourceCollectionKey } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationRequirements } from "../source-type-flow/representation-requirements.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { representCsharpOptionalStorage } from "../source-type-flow/representation-optional.js";
import { sourceCategoryWitnessType } from "../source-type-flow/representation-category.js";
import { sourceNativeType, sourceRepresentationParameter, sourceRepresentationParameterReference } from "../source-type-flow/representation-runtime.js";
import type { CsharpRepresentationHost } from "../source-type-flow/representation-host.js";
import { represented, sourceOutcome, nativeRepresentationFailure, representationRequirements } from "../source-type-flow/representation-results.js";

function collectionKey(host: Pick<CsharpRepresentationHost, "providers">, name: string,
  arguments_: readonly TargetTypeRef[], site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
  return sourceNativeType(host, `Tsonic.CSharp.Js.${name}\`${arguments_.length}`, arguments_,
    name === "ICollectionKey" ? "interface" : "struct", site);
}

export function representCsharpSourceCollectionKey(host: CsharpRepresentationHost, view: CsharpRepresentationView, recipes: CsharpRepresentationRequirements,
  evidence: SourceTypeEvidence, physicalCarrier: TargetTypeRef, site: Node): CsharpRepresentationOutcome<CsharpSourceCollectionKey> {
  view.source.assertEvidence(evidence);
  if (evidence.type.kind === "optional") {
    const original = sourceOutcome(view.source.component(evidence, { kind: "optional-value" }));
    if (original.kind !== "represented") return original;
    const payload = getCsharpNullableElementTargetType(physicalCarrier) ?? getCsharpGenericOptionalParts(physicalCarrier)?.element
      ?? (isCsharpJsValueTargetType(physicalCarrier) ? physicalCarrier : undefined);
    if (payload === undefined) return nativeRepresentationFailure(site,
      "CSHARP_SOURCE_KEY_OPTIONAL_STORAGE_MISMATCH", "The Source optional key requires its actual Native payload, storage and operations contract.");
    const selectedStorage = representCsharpOptionalStorage(host, payload, site);
    if (selectedStorage.kind !== "represented") return selectedStorage;
    const storage = selectedStorage.value;
    if (!targetTypeRefEquals(storage.carrier, physicalCarrier)) return nativeRepresentationFailure(site,
      "CSHARP_SOURCE_KEY_OPTIONAL_STORAGE_MISMATCH", "The Source optional key requires its actual Native payload, storage and operations contract.");
    const selected = view.collectionKey(original.value, payload, site);
    if (selected.kind !== "represented") return selected;
    const type = collectionKey(host, "OptionalCollectionKey", [storage.payload, storage.carrier, storage.operations, selected.value.type], site);
    return type.kind !== "represented" ? type : represented(Object.freeze({
      type: type.value,
      requirements: representationRequirements([storage.requirements, selected.value.requirements]),
    }));
  }
  const logical = view.represent(evidence, "type-argument", site);
  if (logical.kind !== "represented") return logical;
  const key = logical.value;
  const requirements = [key.requirements];
  let selected: TargetTypeRef;
  if (key.kind === "closed-source-sum" && targetTypeRefEquals(key.carrier, physicalCarrier) && key.slots.length >= 2) {
    const arguments_: TargetTypeRef[] = [];
    for (const [index, slot] of key.slots.entries()) {
      const original = key.armStorage.findIndex(storage => storage.kind === "slot" && storage.index === index);
      const arm = key.application.arms[original];
      if (arm === undefined) throw new TypeError("A collection union slot requires its original Source arm evidence.");
      const category = view.category(arm, slot.carrier, site);
      if (category.kind !== "represented") return category;
      const witness = sourceCategoryWitnessType(host, category.value, site);
      if (witness.kind !== "represented") return witness;
      arguments_.push(slot.carrier, witness.value);
      requirements.push(category.value.requirements);
    }
    const type = collectionKey(host, "UnionCollectionKey", Object.freeze(arguments_), site);
    if (type.kind !== "represented") return type;
    selected = type.value;
  } else if (key.kind === "closed-source-sum" && targetTypeRefEquals(key.carrier, physicalCarrier) && key.slots.length === 1) {
    const original = key.armStorage.findIndex(storage => storage.kind === "slot");
    const arm = key.application.arms[original];
    if (arm === undefined) throw new TypeError("A collection payload requires its original Source arm evidence.");
    const category = view.category(arm, key.slots[0]!.carrier, site);
    if (category.kind !== "represented") return category;
    requirements.push(category.value.requirements);
    const witness = sourceCategoryWitnessType(host, category.value, site);
    if (witness.kind !== "represented") return witness;
    const type = collectionKey(host, "SourceCollectionKey", [key.slots[0]!.carrier, witness.value], site);
    if (type.kind !== "represented") return type;
    selected = type.value;
  } else {
    const category = view.category(evidence, physicalCarrier, site);
    if (category.kind !== "represented") return category;
    requirements.push(category.value.requirements);
    const categoryWitness = sourceCategoryWitnessType(host, category.value, site);
    if (categoryWitness.kind !== "represented") return categoryWitness;
    const categoryType = categoryWitness.value;
    if (view.source.freeParameters(evidence).length !== 0) {
      const identity = JSON.stringify(["collection-key", targetTypeRefKey(physicalCarrier), targetTypeRefKey(categoryType)]);
      const dependencies = key.requirements;
      const shell = sourceRepresentationParameterReference(identity, "CollectionKey", dependencies);
      const contract = collectionKey(host, "ICollectionKey", [physicalCarrier, shell], site);
      if (contract.kind !== "represented") return contract;
      const type = sourceRepresentationParameter(identity, "CollectionKey", [
        { kind: "keyword", keyword: "struct" }, { kind: "type", type: contract.value },
      ], dependencies);
      recipes.retain(type, { kind: "collection-key", evidence, physicalCarrier });
      return represented(Object.freeze({ type, requirements: representationRequirements([...requirements, [type]]) }));
    }
    const type = collectionKey(host, "SourceCollectionKey", [physicalCarrier, categoryType], site);
    if (type.kind !== "represented") return type;
    selected = type.value;
  }
  if (key.kind === "closed-source-sum" && targetTypeRefEquals(key.carrier, physicalCarrier) && key.armStorage.some(storage => storage.kind === "absence")) {
    const payload = getCsharpNullableElementTargetType(physicalCarrier) ?? getCsharpGenericOptionalParts(physicalCarrier)?.element;
    if (payload === undefined) return nativeRepresentationFailure(site, "CSHARP_SOURCE_KEY_OPTIONAL_STORAGE_MISMATCH",
      "The Source optional key requires its actual Native payload, storage and operations contract.");
    const selectedStorage = representCsharpOptionalStorage(host, payload, site);
    if (selectedStorage.kind !== "represented") return selectedStorage;
    const storage = selectedStorage.value;
    if (!targetTypeRefEquals(storage.carrier, physicalCarrier)) return nativeRepresentationFailure(site,
      "CSHARP_SOURCE_KEY_OPTIONAL_STORAGE_MISMATCH", "The Source optional key requires its actual Native payload, storage and operations contract.");
    const type = collectionKey(host, "OptionalCollectionKey", [payload, physicalCarrier, storage.operations, selected], site);
    if (type.kind !== "represented") return type;
    selected = type.value;
    requirements.push(storage.requirements);
  }
  return represented(Object.freeze({ type: selected, requirements: representationRequirements(requirements) }));
}
