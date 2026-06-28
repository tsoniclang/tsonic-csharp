import type {
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../target-member-metadata.js";
import {
  materializeCollectionMemberMetadata,
} from "./member-builders.js";
import {
  createCsharpJsCollectionTargetType,
  getCsharpJsCollectionIterableElementType as getPolicyIterableElementType,
} from "./target-types.js";
import {
  collectionMemberPolicyForSelectedSourceIdentity,
  collectionPolicyForSelectedSourceIdentity,
  collectionPolicyForSourceType,
  collectionPolicyForTargetType,
} from "./definitions.js";

export {
  csharpJsMapTargetType,
  csharpJsSetTargetType,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./target-types.js";

export function getCsharpJsIterableElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const policy = collectionPolicyForTargetType(type);
  return policy === undefined ? undefined : getPolicyIterableElementType(policy, type.typeArguments ?? []);
}

export function createCsharpJsCollectionTargetTypeForSourceType(
  type: Type,
  context: ExtensionObservationContext,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const policy = collectionPolicyForSourceType(type, context);
  return policy === undefined ? undefined : createCsharpJsCollectionTargetType(policy, typeArguments);
}

export function collectionTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
  const collectionType = policy === undefined
    ? undefined
    : closedCollectionTypeForPolicy(policy, receiverType, resultType);
  const typeArguments = collectionType?.kind === "target-named" ? collectionType.typeArguments ?? [] : [];
  const memberPolicy = policy === undefined
    ? undefined
    : collectionMemberPolicyForSelectedSourceIdentity(policy, selectedIdentity);
  return policy === undefined || collectionType === undefined || memberPolicy === undefined
    ? []
    : materializeCollectionMemberMetadata({
      policy,
      memberPolicy,
      declaringType: collectionType,
      typeArguments,
    }).map(jsSurfaceTargetMemberFromMetadata);
}

export function collectionTargetTypeForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
  return policy === undefined
    ? undefined
    : createCsharpJsCollectionTargetType(policy, typeArguments);
}

function closedCollectionTypeForPolicy(
  policy: NonNullable<ReturnType<typeof collectionPolicyForSelectedSourceIdentity>>,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (collectionPolicyForTargetType(resultType) === policy) {
    return resultType;
  }
  if (collectionPolicyForTargetType(receiverType) === policy) {
    return receiverType;
  }
  return undefined;
}
