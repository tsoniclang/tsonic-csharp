import type {
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetSourceAccessKind,
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import {
  getCsharpCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  isCsharpReadOnlyIndexableCollectionTargetType,
  csharpListTargetType,
  csharpReadOnlyListTargetType,
} from "../../../target-types.js";
import {
  csharpJsArrayCarrierTargetType,
  isCsharpJsArrayCarrierTargetType,
} from "../array-target-type.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../objects.js";
import {
  getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity,
} from "../properties/member-providers/index.js";
import {
  jsSurfaceSelectedTargetMembersForSelectedIdentity,
} from "../selected-target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../target-member-metadata.js";
import {
  getSelectedSourceIdentityForStructuralUse,
} from "./source-library-selection.js";
import type {
  CsharpArrayCarrierRequirement,
  LifecycleContext,
} from "./types.js";

export function carrierRequirementsForStructuralPropertyUse(
  use: TargetSourceUseRecord,
  elementType: TargetTypeRef,
  lifecycleContext: LifecycleContext,
): readonly CsharpArrayCarrierRequirement[] {
  const selectedIdentity = getSelectedSourceIdentityForStructuralUse(use, lifecycleContext);
  if (selectedIdentity === undefined) {
    return ["full-js"];
  }
  if (use.operation === "property") {
    return propertyCarrierRequirementsForSelectedIdentity(selectedIdentity, elementType, use.access);
  }
  return receiverCarrierRequirementsForSelectedIdentity(selectedIdentity, elementType, use.access);
}

export function carrierRequirementsForStructuralCallArgumentUse(
  use: TargetSourceUseRecord,
  elementType: TargetTypeRef,
  lifecycleContext: LifecycleContext,
): readonly CsharpArrayCarrierRequirement[] {
  const selectedIdentity = getSelectedSourceIdentityForStructuralUse(use, lifecycleContext);
  if (selectedIdentity === undefined || use.argumentIndex === undefined) {
    return ["full-js"];
  }
  const argumentIndex = use.argumentIndex;
  const members = targetMembersForSelectedIdentity(selectedIdentity, elementType);
  if (members.length === 0) {
    return ["full-js"];
  }
  return carrierRequirementsForTargetTypes(
    members
      .map((member) => targetParameterForArgumentIndex(member.parameters, argumentIndex)?.type)
      .filter((type): type is TargetTypeRef => type !== undefined),
  );
}

function propertyCarrierRequirementsForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  elementType: TargetTypeRef,
  access: TargetSourceAccessKind,
): readonly CsharpArrayCarrierRequirement[] {
  if (access !== "read") {
    return ["full-js"];
  }
  const propertyRequirements = carrierRequirementsForStructuralPropertyReceivers(selectedIdentity, elementType);
  if (propertyRequirements.length > 0) {
    return propertyRequirements;
  }
  return receiverCarrierRequirementsForSelectedIdentity(selectedIdentity, elementType, access);
}

function receiverCarrierRequirementsForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  elementType: TargetTypeRef,
  access: TargetSourceAccessKind,
): readonly CsharpArrayCarrierRequirement[] {
  if (access !== "read") {
    return ["full-js"];
  }
  const members = targetMembersForSelectedIdentity(selectedIdentity, elementType);
  if (members.length === 0) {
    return ["full-js"];
  }
  const receiverTypes = members
    .map(targetMemberReceiverType)
    .filter((type): type is TargetTypeRef => type !== undefined);
  if (receiverTypes.length === 0) {
    return ["full-js"];
  }
  const requirements = carrierRequirementsForTargetTypes(receiverTypes);
  return requirements.length === 0 ? ["full-js"] : requirements;
}

function carrierRequirementsForStructuralPropertyReceivers(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  elementType: TargetTypeRef,
): readonly CsharpArrayCarrierRequirement[] {
  for (const candidate of structuralPropertyReceiverCandidates(elementType)) {
    if (propertyTargetMembersForSelectedIdentity(selectedIdentity, candidate.receiverType).length === 0) {
      continue;
    }
    return [candidate.requirement];
  }
  return [];
}

function structuralPropertyReceiverCandidates(
  elementType: TargetTypeRef,
): readonly { readonly receiverType: TargetTypeRef; readonly requirement: CsharpArrayCarrierRequirement }[] {
  return [
    { receiverType: csharpReadOnlyListTargetType(elementType), requirement: "length-read" },
    { receiverType: csharpListTargetType(elementType), requirement: "length-read" },
    { receiverType: csharpJsArrayCarrierTargetType(elementType), requirement: "full-js" },
  ];
}

function propertyTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverType: TargetTypeRef,
): readonly TargetMember[] {
  const member = getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType);
  return member === undefined ? [] : [member];
}

function targetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  elementType: TargetTypeRef,
): readonly TargetMember[] {
  return jsSurfaceSelectedTargetMembersForSelectedIdentity(selectedIdentity, elementType);
}

function targetMemberReceiverType(member: TargetMember): TargetTypeRef | undefined {
  if (member.receiverPassing === "first-argument") {
    return member.parameters[0]?.type;
  }
  return member.static === true ? undefined : member.declaringType;
}

function targetParameterForArgumentIndex(
  parameters: readonly TargetParameter[],
  argumentIndex: number,
): TargetParameter | undefined {
  const parameter = parameters[argumentIndex];
  if (parameter !== undefined) {
    return parameter;
  }
  const lastParameter = parameters[parameters.length - 1];
  return lastParameter?.paramsArray === true && argumentIndex >= parameters.length - 1
    ? lastParameter
    : undefined;
}

function carrierRequirementsForTargetTypes(
  targetTypes: readonly TargetTypeRef[],
): readonly CsharpArrayCarrierRequirement[] {
  const requirements: CsharpArrayCarrierRequirement[] = [];
  for (const targetType of targetTypes) {
    const requirement = carrierRequirementForTargetType(targetType);
    if (requirement !== undefined && !requirements.includes(requirement)) {
      requirements.push(requirement);
    }
  }
  return requirements;
}

function carrierRequirementForTargetType(
  targetType: TargetTypeRef,
): CsharpArrayCarrierRequirement | undefined {
  if (isCsharpJsArrayCarrierTargetType(targetType) || isCsharpJsObjectCarrierTargetType(targetType)) {
    return "full-js";
  }
  if (isCsharpDenseMutableCollectionTargetType(targetType)) {
    return "dense-mutation";
  }
  if (isCsharpReadOnlyIndexableCollectionTargetType(targetType)) {
    return "index-read";
  }
  return getCsharpCollectionElementTargetType(targetType) === undefined
    ? undefined
    : "sequential-read";
}
