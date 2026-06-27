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
  getCsharpJsSourceLibraryPropertyMember,
} from "../properties/member-providers/index.js";
import {
  jsSurfaceSelectedTargetMembersForSourceMember,
} from "../selected-target-member-metadata.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import {
  getSelectedSourceLibraryMemberForStructuralUse,
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
  const sourceMember = getSelectedSourceLibraryMemberForStructuralUse(use, lifecycleContext);
  if (sourceMember === undefined) {
    return ["full-js"];
  }
  if (use.operation === "property") {
    return propertyCarrierRequirementsForSelectedMember(sourceMember, elementType, use.access);
  }
  return receiverCarrierRequirementsForSelectedMember(sourceMember, elementType, use.access);
}

export function carrierRequirementsForStructuralCallArgumentUse(
  use: TargetSourceUseRecord,
  elementType: TargetTypeRef,
  lifecycleContext: LifecycleContext,
): readonly CsharpArrayCarrierRequirement[] {
  const sourceMember = getSelectedSourceLibraryMemberForStructuralUse(use, lifecycleContext);
  if (sourceMember === undefined || use.argumentIndex === undefined) {
    return ["full-js"];
  }
  const argumentIndex = use.argumentIndex;
  const members = targetMembersForSelectedSourceMember(sourceMember, elementType);
  if (members.length === 0) {
    return ["full-js"];
  }
  return carrierRequirementsForTargetTypes(
    members
      .map((member) => targetParameterForArgumentIndex(member.parameters, argumentIndex)?.type)
      .filter((type): type is TargetTypeRef => type !== undefined),
  );
}

function propertyCarrierRequirementsForSelectedMember(
  sourceMember: SourceLibraryMember,
  elementType: TargetTypeRef,
  access: TargetSourceAccessKind,
): readonly CsharpArrayCarrierRequirement[] {
  if (access !== "read") {
    return ["full-js"];
  }
  if (getCsharpJsSourceLibraryPropertyMember(sourceMember, csharpReadOnlyListTargetType(elementType)) !== undefined) {
    return ["length-read"];
  }
  if (getCsharpJsSourceLibraryPropertyMember(sourceMember, csharpListTargetType(elementType)) !== undefined) {
    return ["length-read"];
  }
  if (getCsharpJsSourceLibraryPropertyMember(sourceMember, csharpJsArrayCarrierTargetType(elementType)) !== undefined) {
    return ["full-js"];
  }
  return receiverCarrierRequirementsForSelectedMember(sourceMember, elementType, access);
}

function receiverCarrierRequirementsForSelectedMember(
  sourceMember: SourceLibraryMember,
  elementType: TargetTypeRef,
  access: TargetSourceAccessKind,
): readonly CsharpArrayCarrierRequirement[] {
  if (access !== "read") {
    return ["full-js"];
  }
  const members = targetMembersForSelectedSourceMember(sourceMember, elementType);
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

function targetMembersForSelectedSourceMember(
  sourceMember: SourceLibraryMember,
  elementType: TargetTypeRef,
): readonly TargetMember[] {
  return jsSurfaceSelectedTargetMembersForSourceMember(sourceMember, elementType);
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
