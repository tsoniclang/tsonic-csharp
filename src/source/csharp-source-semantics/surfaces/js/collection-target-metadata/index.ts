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
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
} from "../source-library.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../target-member-metadata.js";
import {
  materializeCollectionMemberMetadata,
} from "./member-builders.js";
import {
  collectionMemberPolicyApplies,
  collectionPolicyForSourceMember,
  collectionPolicyForSourceType,
  collectionPolicyForTargetType,
  collectionSizeIdentityPolicy,
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
  return collectionPolicyForTargetType(type)?.getIterableElementType(type.typeArguments ?? []);
}

export function createCsharpJsCollectionTargetTypeForSourceType(
  type: Type,
  context: ExtensionObservationContext,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  return collectionPolicyForSourceType(type, context)?.createClosedType(typeArguments);
}

export function collectionTargetMembersForSourceMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  const policy = collectionPolicyForSourceMember(sourceMember);
  const collectionType = policy === undefined
    ? undefined
    : closedCollectionTypeForPolicy(policy, receiverType, resultType);
  const typeArguments = collectionType?.kind === "target-named" ? collectionType.typeArguments ?? [] : [];
  const memberPolicy = policy?.members.find((member) => collectionMemberPolicyApplies(policy, member, sourceMember));
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
  if (!sourceLibraryMemberMatches(sourceMember, collectionSizeIdentityPolicy)) {
    return undefined;
  }
  const policy = collectionPolicyForSourceMember(sourceMember);
  if (policy === undefined || !policy.isTargetType(receiverType)) {
    return undefined;
  }
  return jsSurfaceTargetMemberFromMetadata({
    id: `Tsonic.CSharp.Js.${sourceLibraryMemberIdentity(sourceMember)}`,
    sourceName: "size",
    targetName: "size",
    kind: "property",
    returnType: csharpSourcePrimitiveTargetType("int32"),
    declaringType: receiverType,
  });
}

function closedCollectionTypeForPolicy(
  policy: {
    readonly createOpenType: () => TargetTypeRef;
    readonly isTargetType: (type: TargetTypeRef | undefined) => boolean;
  },
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (policy.isTargetType(resultType)) {
    return resultType;
  }
  if (policy.isTargetType(receiverType)) {
    return receiverType;
  }
  return policy.createOpenType();
}
