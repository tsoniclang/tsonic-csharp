import type {
  TargetTypeRef,
  Symbol,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../../target-types.js";
import type {
  TargetSourceAccessKind,
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import type {
  CsharpOperationsProviderHost,
} from "../../../operations-provider.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
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
    return ["unresolved-structural-use"];
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
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly CsharpArrayCarrierRequirement[] {
  const selectedSignatureRequirements = carrierRequirementsForSelectedSignatureArgumentUse(use, lifecycleContext, host);
  if (selectedSignatureRequirements.length > 0) {
    return selectedSignatureRequirements;
  }
  const selectedIdentity = getSelectedSourceIdentityForStructuralUse(use, lifecycleContext);
  if (selectedIdentity === undefined || use.argumentIndex === undefined) {
    return ["unresolved-structural-use"];
  }
  const argumentIndex = use.argumentIndex;
  const members = targetMembersForSelectedIdentity(selectedIdentity, elementType);
  if (members.length === 0) {
    return ["unresolved-structural-use"];
  }
  return carrierRequirementsForTargetTypes(
    members
      .map((member) => targetParameterForArgumentIndex(member.parameters, argumentIndex)?.type)
      .filter((type): type is TargetTypeRef => type !== undefined),
  );
}

function carrierRequirementsForSelectedSignatureArgumentUse(
  use: TargetSourceUseRecord,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly CsharpArrayCarrierRequirement[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || use.selectedSignature === undefined || use.argumentIndex === undefined) {
    return [];
  }
  const parameters = compiler.checker.getSignatureParameters(use.selectedSignature);
  const parameter = selectedSignatureParameterForArgument(parameters, use.argumentIndex);
  if (parameter === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const parameterType = compiler.checker.getTypeOfSymbol(parameter, { sourceFile: use.sourceFile });
  const parameterCarrier = host.getTargetTypeRefForSubject(parameter, context, {
    allowRuntimeCarrier: true,
    sourceFile: use.sourceFile,
  }) ?? host.getTargetTypeRefForType?.(parameterType, context, {
      allowRuntimeCarrier: true,
      sourceFile: use.sourceFile,
    });
  return parameterCarrier === undefined
    ? []
    : carrierRequirementsForTargetTypes([parameterCarrier]);
}

function selectedSignatureParameterForArgument(
  parameters: readonly (Symbol | undefined)[],
  argumentIndex: number,
): Symbol | undefined {
  return parameters[argumentIndex] ?? parameters[parameters.length - 1];
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
    return ["unresolved-structural-use"];
  }
  const receiverTypes = members
    .map(targetMemberReceiverType)
    .filter((type): type is TargetTypeRef => type !== undefined);
  if (receiverTypes.length === 0) {
    return ["unresolved-structural-use"];
  }
  const requirements = carrierRequirementsForTargetTypes(receiverTypes);
  return requirements.length === 0 ? ["unresolved-structural-use"] : requirements;
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
): readonly CsharpTargetMember[] {
  const member = getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType);
  return member === undefined ? [] : [member];
}

function targetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  elementType: TargetTypeRef,
): readonly CsharpTargetMember[] {
  return jsSurfaceSelectedTargetMembersForSelectedIdentity(selectedIdentity, { contextualElementType: elementType });
}

function targetMemberReceiverType(member: CsharpTargetMember): TargetTypeRef | undefined {
  if (member.receiverPassing === "first-argument") {
    return member.parameters[0]?.type;
  }
  return member.static === true ? undefined : member.declaringType;
}

function targetParameterForArgumentIndex(
  parameters: readonly CsharpTargetParameter[],
  argumentIndex: number,
): CsharpTargetParameter | undefined {
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
  const selected = selectLeastPermissiveCarrierRequirement(requirements);
  return selected === undefined ? [] : [selected];
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

function selectLeastPermissiveCarrierRequirement(
  requirements: readonly CsharpArrayCarrierRequirement[],
): CsharpArrayCarrierRequirement | undefined {
  let selected: CsharpArrayCarrierRequirement | undefined;
  for (const requirement of requirements) {
    if (selected === undefined || carrierRequirementRank(requirement) < carrierRequirementRank(selected)) {
      selected = requirement;
    }
  }
  return selected;
}

function carrierRequirementRank(requirement: CsharpArrayCarrierRequirement): number {
  switch (requirement) {
    case "sequential-read":
      return 1;
    case "index-read":
    case "length-read":
      return 2;
    case "dense-mutation":
      return 3;
    case "full-js":
      return 4;
    case "unresolved-structural-use":
      return 5;
  }
}
