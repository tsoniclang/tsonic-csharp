import type {
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
} from "../source-library.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceTargetMemberFromMetadata,
} from "../target-member-metadata.js";
import {
  materializeCollectionMemberMetadata,
} from "./member-builders.js";
import {
  createCsharpJsCollectionTargetType,
  createOpenCsharpJsCollectionTargetType,
  getCsharpJsCollectionIterableElementType as getPolicyIterableElementType,
} from "./target-types.js";
import {
  collectionMemberPolicyForSelectedSourceIdentity,
  collectionPolicyForSelectedSourceIdentity,
  collectionPolicyForSourceType,
  collectionPolicyForTargetType,
  collectionSourceIdentityMatchesSize,
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

export function collectionTargetMembersForSourceMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
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

export function getCollectionPropertyTargetMember(sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined): TargetMember | undefined {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  if (!collectionSourceIdentityMatchesSize(selectedIdentity)) {
    return undefined;
  }
  const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
  if (policy === undefined || collectionPolicyForTargetType(receiverType) !== policy) {
    return undefined;
  }
  return jsSurfaceTargetMemberFromMetadata({
    id: `Tsonic.CSharp.Js.${policy.target.name}.size`,
    sourceName: "size",
    targetName: "size",
    kind: "property",
    returnType: csharpSourcePrimitiveTargetType("int32"),
    declaringType: receiverType,
  });
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
  return createOpenCsharpJsCollectionTargetType(policy);
}
