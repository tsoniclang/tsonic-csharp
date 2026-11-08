import type { Node } from "@tsonic/tsts";
import type { SourceCategoryDomain, SourceComponentSelector, SourceMemberOrigin, SourceSumApplication, SourceTypeEvidence } from "@tsonic/target-api/source";
import { sourceNumericKeyValueKey } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type {
  CsharpRepresentationOutcome,
  CsharpRepresentedType,
  CsharpRepresentationView,
  CsharpSourceRoleWitness,
  CsharpSourceSumArmStorage,
  CsharpSourceSumPhysicalSlot,
} from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { csharpRuntimeUnionTargetType, csharpAbsenceTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { representCsharpOptionalStorage } from "./representation-optional.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { represented, sourceOutcome, nativeRepresentationFailure, representationRequirements } from "./representation-results.js";
import { sourceRepresentationDependencies, sourceRepresentationParameter, sourceRuntimeType } from "./representation-runtime.js";
import type { CsharpRepresentationRequirements } from "./representation-requirements.js";

export function sourceCategoriesEqual(left: SourceCategoryDomain, right: SourceCategoryDomain): boolean {
  if (left === right) return true;
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "known": return right.kind === "known" && left.category === right.category;
    case "parameter": return right.kind === "parameter" && left.declaration === right.declaration;
    case "dynamic": return true;
    case "choice": return right.kind === "choice" && left.alternatives.length === right.alternatives.length &&
      left.alternatives.every((value, index) => sourceCategoriesEqual(value, right.alternatives[index]!));
  }
}

export function representSourceSum(
  host: CsharpRepresentationHost,
  view: CsharpRepresentationView,
  recipes: CsharpRepresentationRequirements,
  evidence: SourceTypeEvidence,
  application: SourceSumApplication,
  site: Node,
): CsharpRepresentationOutcome<CsharpRepresentedType> {
  for (const arm of application.arms) host.source.assertEvidence(arm);
  for (const role of application.roles) host.source.assertEvidence(role.value);
  if (application.kind === "open") return evidence.type.kind === "optional"
    ? representOpenOptional(host, view, recipes, evidence, application, site) : representOpenSum(host, view, recipes, evidence, application, site);
  if (application.freeParameters.length !== 0) throw new TypeError("A closed Source sum retains no free parameters.");
  const slots: CsharpSourceSumPhysicalSlot[] = [];
  const armStorage: CsharpSourceSumArmStorage[] = [];
  const arms: CsharpRepresentedType[] = [];
  let optional = false;
  for (const arm of application.arms) {
    const result = view.represent(arm, "type-argument", site);
    if (result.kind !== "represented") return result;
    arms.push(result.value);
    if (isCsharpAbsenceTargetType(result.value.carrier)) {
      armStorage.push(Object.freeze({ kind: "absence" }));
      optional = true;
      continue;
    }
    let index = slots.findIndex(slot => targetTypeRefEquals(slot.carrier, result.value.carrier) &&
      sourceCategoriesEqual(slot.category, arm.category));
    if (index === -1) {
      index = slots.length;
      slots.push(Object.freeze({ carrier: result.value.carrier, category: arm.category }));
    }
    armStorage.push(Object.freeze({ kind: "slot", index }));
  }
  const valueCarrier = slots.length === 0 ? csharpAbsenceTargetType()
    : slots.length === 1 ? slots[0]!.carrier : csharpRuntimeUnionTargetType(slots.map(slot => slot.carrier));
  if (valueCarrier === undefined) return nativeRepresentationFailure(site, "CSHARP_SOURCE_SUM_ARITY_UNSUPPORTED",
    "A closed Source sum requires at most eight distinct immediate Native payload slots.");
  const optionalStorage = optional ? representCsharpOptionalStorage(host, valueCarrier, site) : undefined;
  if (optionalStorage !== undefined && optionalStorage.kind !== "represented") return optionalStorage;
  const storageOptional = optionalStorage?.value;
  const carrier = storageOptional?.carrier ?? valueCarrier;
  const requirements = representationRequirements([...arms.map(arm => arm.requirements), storageOptional?.requirements ?? []]);
  const roleRequirements = [requirements];
  const roles: CsharpSourceRoleWitness[] = [];
  for (const source of application.roles) {
    const indexes = source.armIndexes;
    if (indexes.length === 0) continue;
    if (indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= armStorage.length)) {
      throw new TypeError("A Source role requires its exact nonempty closed arm inventory.");
    }
    const roleSlots: CsharpSourceSumPhysicalSlot[] = [];
    const roleMap: CsharpSourceSumArmStorage[] = [];
    let roleOptional = false;
    for (const index of indexes) {
      const storage = armStorage[index]!;
      if (storage.kind === "absence") {
        roleOptional = true;
        continue;
      }
      if (roleMap.some(selected => selected.kind === "slot" && selected.index === storage.index)) continue;
      roleSlots.push(slots[storage.index]!);
      roleMap.push(storage);
    }
    const payload = roleSlots.length === 0 ? csharpAbsenceTargetType() : roleSlots.length === 1 ? roleSlots[0]!.carrier
      : csharpRuntimeUnionTargetType(roleSlots.map(slot => slot.carrier));
    if (payload === undefined) return nativeRepresentationFailure(site, "CSHARP_SOURCE_ROLE_ARITY_UNSUPPORTED", "A Source role exceeds the Native immediate union arity.");
    const optionalValue = roleOptional ? representCsharpOptionalStorage(host, payload, site) : undefined;
    if (optionalValue !== undefined && optionalValue.kind !== "represented") return optionalValue;
    const valueOptional = optionalValue?.value;
    const valueType = valueOptional?.carrier ?? payload;
    roleRequirements.push(valueOptional?.requirements ?? []);
    let witness: CsharpRepresentationOutcome<TargetTypeRef>;
    if (targetTypeRefEquals(carrier, valueType) && roleSlots.length === slots.length &&
      roleMap.every((entry, index) => entry.kind === "slot" && entry.index === index) && roleOptional === optional) {
      witness = sourceRuntimeType(host, "SourceUnionIdentity", [carrier], "struct", site);
    } else if (!optional && !roleOptional && roleMap.length === 1 && roleMap[0]?.kind === "slot" && slots.length >= 2) {
      witness = sourceRuntimeType(host, `SourceUnionRole${roleMap[0].index + 1}`, slots.map(slot => slot.carrier), "struct", site);
    } else {
      witness = host.retainRoleWitness(Object.freeze({ storage: carrier, value: valueType,
        storageSlots: Object.freeze([...slots]), valueSlots: Object.freeze(roleSlots), valueToStorage: Object.freeze(roleMap),
        storageOptional, valueOptional,
        requirements: representationRequirements([requirements, valueOptional?.requirements ?? []]) }), site);
    }
    if (witness.kind !== "represented") return witness;
    roles.push(Object.freeze({ source, valueType, witnessType: witness.value }));
  }
  return represented(Object.freeze({ kind: "closed-source-sum", evidence, application, carrier,
    requirements: representationRequirements(roleRequirements),
    slots: Object.freeze(slots), armStorage: Object.freeze(armStorage), roles: Object.freeze(roles) }));
}

function representOpenSum(
  host: CsharpRepresentationHost,
  view: CsharpRepresentationView,
  recipes: CsharpRepresentationRequirements,
  evidence: SourceTypeEvidence,
  application: SourceSumApplication,
  site: Node,
): CsharpRepresentationOutcome<CsharpRepresentedType> {
  if (application.freeParameters.length === 0) throw new TypeError("An open Source sum requires its original free parameter inventory.");
  const family = host.identity(application.family.component.root).identity;
  const component = application.family.component.path.map(selector => componentIdentity(host, selector));
  const bindings: string[] = [];
  for (const binding of application.bindings) {
    host.source.assertEvidence(binding.value);
    const value = view.represent(binding.value, "type-argument", site);
    if (value.kind !== "represented") return value;
    bindings.push(JSON.stringify([host.identity(binding.declaration).identity, evidenceIdentity(host, binding.value),
      targetTypeRefKey(value.value.carrier)]));
  }
  const identity = JSON.stringify(["source-sum", family, component, bindings, application.arms.map(arm => evidenceIdentity(host, arm)),
    application.freeParameters.map(parameter => host.identity(parameter.declaration).identity)]);
  const carrier = sourceRepresentationParameter(identity, "SourceStorage", [], sourceRepresentationDependencies(host, evidence));
  recipes.retain(carrier, { kind: "value", evidence, position: "type-argument" });
  const requirements = [carrier];
  const roles: CsharpSourceRoleWitness[] = [];
  for (const source of application.roles) {
    if (source.armIndexes.length === 0) continue;
    const result = openRoleValue(host, view, recipes, evidence, application, source, carrier, identity, site);
    if (result.kind !== "represented") return result;
    const valueType = result.value.carrier;
    const contract = sourceRuntimeType(host, "ISourceUnionRole", [carrier, valueType], "interface", site);
    if (contract.kind !== "represented") return contract;
    const witness = sourceRepresentationParameter(JSON.stringify([identity, "role", source.role.index]), "SourceRole", [
      { kind: "keyword", keyword: "struct" }, { kind: "type", type: contract.value },
    ], sourceRepresentationDependencies(host, source.value));
    recipes.retain(witness, { kind: "role", evidence, role: source.role });
    requirements.push(witness);
    requirements.push(...result.value.requirements);
    roles.push(Object.freeze({ source, valueType, witnessType: witness }));
  }
  return represented(Object.freeze({ kind: "open-source-sum", evidence, application, carrier,
    requirements: representationRequirements([requirements]), roles: Object.freeze(roles) }));
}

function representOpenOptional(host: CsharpRepresentationHost, view: CsharpRepresentationView, recipes: CsharpRepresentationRequirements,
  evidence: SourceTypeEvidence, application: SourceSumApplication, site: Node): CsharpRepresentationOutcome<CsharpRepresentedType> {
  const original = sourceOutcome(host.source.component(evidence, { kind: "optional-value" }));
  if (original.kind !== "represented") return original;
  const payload = view.represent(original.value, "type-argument", site);
  if (payload.kind !== "represented") return payload;
  const selectedLayout = representCsharpOptionalStorage(host, payload.value.carrier, site);
  if (selectedLayout.kind !== "represented") return selectedLayout;
  const layout = selectedLayout.value;
  const identity = JSON.stringify(["source-optional", evidenceIdentity(host, evidence), targetTypeRefKey(layout.carrier)]);
  const requirements = [payload.value.requirements, layout.requirements];
  const roles: CsharpSourceRoleWitness[] = [];
  for (const source of application.roles) {
    if (source.armIndexes.length === 0) continue;
    const result = openRoleValue(host, view, recipes, evidence, application, source, layout.carrier, identity, site);
    if (result.kind !== "represented") return result;
    const roleType = result.value.carrier;
    let selected: CsharpRepresentationOutcome<TargetTypeRef>;
    if (isCsharpAbsenceTargetType(roleType)) selected = sourceRuntimeType(host, "SourceUnionOptionalAbsence",
      [layout.payload, layout.carrier, layout.operations], "struct", site);
    else if (targetTypeRefEquals(roleType, layout.carrier) && source.armIndexes.length === application.arms.length) {
      selected = sourceRuntimeType(host, "SourceUnionIdentity", [layout.carrier], "struct", site);
    } else if (targetTypeRefEquals(roleType, layout.payload)) {
      const inner = sourceRuntimeType(host, "SourceUnionIdentity", [roleType], "struct", site);
      if (inner.kind !== "represented") return inner;
      selected = sourceRuntimeType(host, "SourceUnionOptionalRole",
        [layout.payload, layout.carrier, roleType, layout.operations, inner.value], "struct", site);
    } else {
      const contract = sourceRuntimeType(host, "ISourceUnionRole", [layout.carrier, roleType], "interface", site);
      if (contract.kind !== "represented") return contract;
      selected = represented(sourceRepresentationParameter(JSON.stringify([identity, "role", source.role.index]), "SourceRole", [
        { kind: "keyword", keyword: "struct" }, { kind: "type", type: contract.value },
      ], sourceRepresentationDependencies(host, source.value)));
    }
    if (selected.kind !== "represented") return selected;
    const witness = selected.value;
    requirements.push(result.value.requirements);
    if (witness.kind === "type-parameter" && witness.csharpConstraints?.kind === "resolved") {
      const parameter = Object.freeze({ ...witness, csharpConstraints: witness.csharpConstraints });
      recipes.retain(parameter, { kind: "role", evidence, role: source.role });
      requirements.push([parameter]);
    }
    roles.push(Object.freeze({ source, valueType: roleType, witnessType: witness }));
  }
  return represented(Object.freeze({ kind: "open-source-sum", evidence, application, carrier: layout.carrier,
    requirements: representationRequirements(requirements), roles: Object.freeze(roles) }));
}

function openRoleValue(host: CsharpRepresentationHost, view: CsharpRepresentationView, recipes: CsharpRepresentationRequirements, evidence: SourceTypeEvidence,
  application: SourceSumApplication, source: SourceSumApplication["roles"][number], carrier: TargetTypeRef,
  identity: string, site: Node): CsharpRepresentationOutcome<CsharpRepresentedType> {
  if (source.armIndexes.every(index => application.arms[index]?.type.kind === "intrinsic" &&
    application.arms[index]?.type.intrinsic === "absence")) {
    return represented(Object.freeze({ kind: "direct", evidence: source.value, carrier: csharpAbsenceTargetType(), requirements: Object.freeze([]) }));
  }
  if (source.value.sum?.family !== application.family || source.value.type.kind !== "union" && source.value.type.kind !== "optional") {
    return view.represent(source.value, "type-argument", site);
  }
  if (source.armIndexes.length === application.arms.length && sourceCategoriesEqual(source.value.category, evidence.category)) {
    return represented(Object.freeze({ kind: "direct", evidence: source.value, carrier, requirements: Object.freeze([]) }));
  }
  const value = sourceRepresentationParameter(JSON.stringify([identity, "value", source.role.index,
    evidenceIdentity(host, source.value)]), "SourceRoleValue", [], sourceRepresentationDependencies(host, source.value));
  recipes.retain(value, { kind: "role-value", evidence, role: source.role });
  return represented(Object.freeze({ kind: "direct", evidence: source.value, carrier: value, requirements: Object.freeze([value]) }));
}

function evidenceIdentity(host: CsharpRepresentationHost, evidence: SourceTypeEvidence): unknown {
  return [host.identity(evidence.component.root).identity, evidence.component.path.map(selector => componentIdentity(host, selector)),
    evidence.type.kind, evidence.type.kind === "intrinsic" ? evidence.type.intrinsic
      : evidence.type.kind === "primitive" ? evidence.type.primitive : null, categoryIdentity(host, evidence.category)];
}

function categoryIdentity(host: CsharpRepresentationHost, category: SourceCategoryDomain): unknown {
  switch (category.kind) {
    case "known": return [category.kind, category.category];
    case "parameter": return [category.kind, host.identity(category.declaration).identity];
    case "dynamic": return category.kind;
    case "choice": return [category.kind, category.alternatives.map(value => categoryIdentity(host, value))];
  }
}

function componentIdentity(host: CsharpRepresentationHost, selector: SourceComponentSelector): unknown {
  switch (selector.kind) {
    case "optional-value": case "array-element": case "awaited": case "intersection-result": return selector.kind;
    case "tuple-element": return [selector.kind, selector.index];
    case "tuple-slice": return [selector.kind, selector.start, selector.endCount, selector.readonly];
    case "union-member": case "intersection-member": case "argument-place": case "parameter-place": return [selector.kind, selector.index];
    case "argument-tail": case "parameter-tail": return [selector.kind, selector.start];
    case "type-argument": return [selector.kind, host.identity(selector.declaration).identity, selector.index];
    case "index-key": case "index-value": return [selector.kind, host.identity(selector.declaration).identity];
    case "projection-source": return selector.kind;
    case "sum-arm": return [selector.kind, host.identity(selector.family.component.root).identity,
      selector.family.component.path.map(part => componentIdentity(host, part)), selector.index];
    case "member": return [selector.kind, memberIdentity(host, selector.origin)];
    case "parameter": return [selector.kind, host.identity(selector.signature.owner).identity,
      selector.signature.kind, selector.signature.declaration === undefined ? null : host.identity(selector.signature.declaration).identity, selector.index];
    case "receiver": case "result": return [selector.kind, host.identity(selector.signature.owner).identity, selector.signature.kind,
      selector.signature.declaration === undefined ? null : host.identity(selector.signature.declaration).identity];
    case "signature-tail": return [selector.kind, host.identity(selector.signature.owner).identity,
      selector.signature.kind, selector.signature.declaration === undefined ? null : host.identity(selector.signature.declaration).identity,
      selector.start, selector.readonly];
  }
}

function memberIdentity(host: CsharpRepresentationHost, origin: SourceMemberOrigin): unknown {
  switch (origin.kind) {
    case "declared": return [origin.kind, host.identity(origin.declaration).identity];
    case "class-prototype": return [origin.kind, host.identity(origin.owner).identity];
    case "mapped": return [origin.kind, host.identity(origin.owner).identity, origin.key.kind,
      origin.key.kind === "unique-symbol" ? host.identity(origin.key.declaration).identity
        : origin.key.kind === "number" ? sourceNumericKeyValueKey(origin.key.value) : origin.key.value];
  }
}
