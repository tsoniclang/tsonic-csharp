import type { Node } from "@tsonic/tsts";
import type { SourceCategory, SourceTypeEvidence, SourceTypeParameter } from "@tsonic/target-api/source";
import type { TargetTypeRef, CsharpRepresentedTypeParameter } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView, CsharpSourceCategoryWitness } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { csharpCarrierAdmitsSourceAbsence, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpCallableMembers } from "../../../target-model/types/carriers/delegates.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { sourceRuntimeType, sourceRepresentationDependencies, sourceRepresentationParameter } from "./representation-runtime.js";
import { represented, nativeRepresentationFailure, representationRequirements, sourceOutcome } from "./representation-results.js";
import { representCsharpOptionalStorage } from "./representation-optional.js";
import type { CsharpRepresentationRequirements } from "./representation-requirements.js";

const categoryNames: Readonly<Record<SourceCategory, string>> = Object.freeze({
  absence: "Absent", boolean: "Boolean", number: "Number", bigint: "BigInt", string: "String", symbol: "Symbol", object: "Object", function: "Function",
});

export function sourceCategoryWitnessType(host: Pick<CsharpRepresentationHost, "providers">,
  category: CsharpSourceCategoryWitness, site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
  return category.kind === "witness" ? represented(category.witnessType)
    : sourceRuntimeType(host, `Source${categoryNames[category.category]}Category`, [category.valueType], "struct", site);
}

function nativeCarrierSupportsCategory(category: SourceCategory, carrier: TargetTypeRef): boolean {
  if (isCsharpJsValueTargetType(carrier)) return true;
  if (category === "absence") return csharpCarrierAdmitsSourceAbsence(carrier);
  if (isCsharpAbsenceTargetType(carrier)) return false;
  if (carrier.kind === "source-primitive") {
    switch (category) {
      case "boolean": return carrier.name === "bool";
      case "string": return carrier.name === "char";
      case "number": return carrier.name !== "bool" && carrier.name !== "char";
      case "bigint": return carrier.name !== "bool" && carrier.name !== "char" &&
        carrier.name !== "float16" && carrier.name !== "float32" && carrier.name !== "float64" && carrier.name !== "decimal";
      default: return false;
    }
  }
  if (carrier.kind === "array" || carrier.kind === "tuple") return category === "object";
  if (carrier.kind !== "target-named") return false;
  const native = carrier as CsharpTargetNamedTypeRef;
  const callable = getCsharpCallableMembers(carrier) !== undefined;
  if (category === "function") return callable || native.csharpTypeofRuntimeKind === "function";
  if (category === "object") return !callable && native.csharpSpecialType !== "string" &&
    native.csharpSpecialType !== "void" && native.csharpSpecialType !== "nullable" &&
    native.csharpTypeofRuntimeKind !== "boolean" && native.csharpTypeofRuntimeKind !== "number" &&
    native.csharpTypeofRuntimeKind !== "bigint" && native.csharpTypeofRuntimeKind !== "string" &&
    native.csharpTypeofRuntimeKind !== "symbol" && native.csharpTypeofRuntimeKind !== "function" &&
    native.csharpSourceDeclarationKind !== "enum";
  return native.csharpTypeofRuntimeKind === category || category === "number" && native.csharpSourceDeclarationKind === "enum";
}

export function representSourceCategory(
  host: CsharpRepresentationHost,
  view: CsharpRepresentationView,
  recipes: CsharpRepresentationRequirements,
  evidence: SourceTypeEvidence,
  physicalCarrier: TargetTypeRef,
  site: Node,
  parameter: (original: SourceTypeParameter) => CsharpRepresentationOutcome<{
    readonly carrier: TargetTypeRef; readonly requirements: readonly CsharpRepresentedTypeParameter[];
  }>,
): CsharpRepresentationOutcome<CsharpSourceCategoryWitness> {
  host.source.assertEvidence(evidence);
  if (isCsharpVoidTargetType(physicalCarrier)) return nativeRepresentationFailure(site, "CSHARP_VOID_VALUE_ERASURE",
    "A Native void completion has no TValue payload to erase; its owning expression must first seal the Source absence completion.");
  const base = { evidence, valueType: physicalCarrier, requirements: Object.freeze([]) };
  const category = evidence.category;
  if (category.kind === "known") {
    if (!nativeCarrierSupportsCategory(category.category, physicalCarrier)) {
      if (physicalCarrier.kind !== "type-parameter") return nativeRepresentationFailure(site,
        "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH", "The authenticated Source category cannot be represented by the actual Native carrier.");
      const logical = view.represent(evidence, "value", site);
      if (logical.kind !== "represented") return logical;
      if (!targetTypeRefEquals(logical.value.carrier, physicalCarrier)) return nativeRepresentationFailure(site,
        "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH", "The authenticated Source category cannot be represented by the actual Native carrier.");
      return represented(Object.freeze({ ...base, requirements: logical.value.requirements, kind: "known", category: category.category }));
    }
    return represented(Object.freeze({ ...base, kind: "known", category: category.category }));
  }
  if (category.kind === "parameter") {
    const original = parameter(host.source.typeParameter(category.declaration));
    if (original.kind !== "represented") return original;
    const contract = sourceRuntimeType(host, "ISourceValueCategory", [physicalCarrier], "interface", site);
    if (contract.kind !== "represented") return contract;
    const witness = sourceRepresentationParameter(JSON.stringify(["source-category", host.identity(category.declaration).identity,
      targetTypeRefKey(physicalCarrier)]), "SourceCategory", [
      { kind: "keyword", keyword: "struct" },
      { kind: "type", type: contract.value },
    ], sourceRepresentationDependencies(host, evidence));
    recipes.retain(witness, { kind: "category", evidence, physicalCarrier });
    return represented(Object.freeze({ ...base, kind: "witness", witnessType: witness,
      requirements: representationRequirements([original.value.requirements, [witness]]) }));
  }
  if (category.kind === "dynamic") {
    if (!isCsharpJsValueTargetType(physicalCarrier)) return nativeRepresentationFailure(site, "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH",
      "A dynamic Source category requires its actual category-bearing value storage; a raw CLR payload cannot recover its Source category.");
    const witness = sourceRuntimeType(host, "SourceStoredValueCategory", [], "struct", site);
    return witness.kind !== "represented" ? witness
      : represented(Object.freeze({ ...base, kind: "witness", witnessType: witness.value }));
  }

  const optional = getCsharpNullableElementTargetType(physicalCarrier);
  const genericOptional = getCsharpGenericOptionalParts(physicalCarrier);
  if (evidence.type.kind === "optional" && (optional !== undefined || genericOptional !== undefined)) {
    const child = sourceOutcome(host.source.component(evidence, { kind: "optional-value" }));
    if (child.kind !== "represented") return child;
    const valueType = optional ?? genericOptional!.element;
    const value = view.category(child.value, valueType, site);
    if (value.kind !== "represented") return value;
    const valueWitness = sourceCategoryWitnessType(host, value.value, site);
    if (valueWitness.kind !== "represented") return valueWitness;
    const selectedLayout = representCsharpOptionalStorage(host, valueType, site);
    if (selectedLayout.kind !== "represented") return selectedLayout;
    const layout = selectedLayout.value;
    if (!targetTypeRefEquals(layout.carrier, physicalCarrier)) return nativeRepresentationFailure(site,
      "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH", "The optional Source category requires its actual Native storage and operations contract.");
    const witness = sourceRuntimeType(host, "SourceOptionalValueCategory", [valueType, physicalCarrier, layout.operations, valueWitness.value], "struct", site);
    return witness.kind !== "represented" ? witness : represented(Object.freeze({ ...base, kind: "witness", witnessType: witness.value,
      requirements: representationRequirements([value.value.requirements, layout.requirements]) }));
  }

  const representedType = view.represent(evidence, "value", site);
  if (representedType.kind !== "represented") return representedType;
  const layout = representedType.value;
  if (layout.kind === "open-source-sum" && targetTypeRefEquals(physicalCarrier, layout.carrier)) {
    const contract = sourceRuntimeType(host, "ISourceValueCategory", [physicalCarrier], "interface", site);
    if (contract.kind !== "represented") return contract;
    const witness = sourceRepresentationParameter(JSON.stringify(["source-category", targetTypeRefKey(layout.carrier)]), "SourceCategory", [
      { kind: "keyword", keyword: "struct" }, { kind: "type", type: contract.value },
    ], sourceRepresentationDependencies(host, evidence));
    recipes.retain(witness, { kind: "category", evidence, physicalCarrier });
    return represented(Object.freeze({ ...base, kind: "witness", witnessType: witness,
      requirements: representationRequirements([layout.requirements, [witness]]) }));
  }
  if (layout.kind !== "closed-source-sum" || !targetTypeRefEquals(layout.carrier, physicalCarrier)) {
    return nativeRepresentationFailure(site, "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH",
      "A mixed Source category requires an authenticated correspondence to the actual Native immediate slot vector.");
  }
  const arguments_: TargetTypeRef[] = [];
  const requirements = [layout.requirements];
  for (const [index, slot] of layout.slots.entries()) {
    const armIndex = layout.armStorage.findIndex(storage => storage.kind === "slot" && storage.index === index);
    const arm = layout.application.arms[armIndex];
    if (arm === undefined) throw new TypeError("A physical Source sum slot requires an authenticated original arm.");
    const value = view.category(arm, slot.carrier, site);
    if (value.kind !== "represented") return value;
    const witness = sourceCategoryWitnessType(host, value.value, site);
    if (witness.kind !== "represented") return witness;
    arguments_.push(slot.carrier, witness.value);
    requirements.push(value.value.requirements);
  }
  if (layout.slots.length === 0) return represented(Object.freeze({ ...base, kind: "known", category: "absence" }));
  const valueType = optional ?? physicalCarrier;
  const selected = layout.slots.length === 1 ? represented(arguments_[1]!)
    : sourceRuntimeType(host, "SourceUnionValueCategory", Object.freeze(arguments_), "struct", site);
  if (selected.kind !== "represented") return selected;
  let witness = selected.value;
  if (optional !== undefined) {
    const selectedStorage = representCsharpOptionalStorage(host, valueType, site);
    if (selectedStorage.kind !== "represented") return selectedStorage;
    const storage = selectedStorage.value;
    if (!targetTypeRefEquals(storage.carrier, physicalCarrier)) return nativeRepresentationFailure(site,
      "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH", "The optional Source category requires its actual Native storage and operations contract.");
    const optionalWitness = sourceRuntimeType(host, "SourceOptionalValueCategory", [valueType, physicalCarrier, storage.operations, witness], "struct", site);
    if (optionalWitness.kind !== "represented") return optionalWitness;
    witness = optionalWitness.value;
    requirements.push(storage.requirements);
  }
  return represented(Object.freeze({ ...base, kind: "witness", witnessType: witness,
    requirements: representationRequirements(requirements) }));
}
