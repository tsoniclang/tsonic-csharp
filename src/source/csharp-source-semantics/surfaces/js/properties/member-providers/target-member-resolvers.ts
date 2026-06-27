import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "../../../../target-types.js";
import {
  csharpJsArrayCarrierId,
} from "../../array-target-type.js";
import {
  csharpJsMapCollectionPolicy,
} from "../../collection-target-metadata/map-metadata.js";
import {
  csharpJsSetCollectionPolicy,
} from "../../collection-target-metadata/set-metadata.js";
import {
  jsonTargetMemberIdentityIndex,
} from "../../json.js";
import {
  stringPropertyTargetMemberIdentityIndex,
} from "../../strings.js";
import {
  mathPropertyTargetMemberIdentityIndex,
} from "../../math.js";
import {
  numberPropertyTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  objectTargetMemberIdentityIndex,
} from "../../objects.js";
import {
  regExpPropertyTargetMemberIdentityIndex,
} from "../../regexp/index.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../../source-library.js";
import type {
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";
import type {
  JsSurfacePropertyPrecheck,
  JsSurfacePropertyRow,
  JsSurfacePropertyTargetProvider,
  JsSurfacePropertyTargetProviderResolver,
  JsSurfaceReceiverPropertyMember,
  JsSurfaceReceiverPropertySelector,
} from "./types.js";

export const int32PropertyReturnType = csharpSourcePrimitiveTargetType("int32");

const objectCallablePropertyIdentities = [
  "Object.keys",
  "Object.values",
  "Object.entries",
  "Object.assign",
  "Object.hasOwn",
] as const satisfies readonly SourceLibraryMemberKey[];

const jsonCallablePropertyIdentities = [
  "JSON.parse",
  "JSON.stringify",
] as const satisfies readonly SourceLibraryMemberKey[];

const arrayLengthPropertyIdentities = [
  "Array.length",
  "ReadonlyArray.length",
] as const satisfies readonly SourceLibraryMemberKey[];

const mapSizePropertyIdentities = [
  "Map.size",
  "ReadonlyMap.size",
] as const satisfies readonly SourceLibraryMemberKey[];

const setSizePropertyIdentities = [
  "Set.size",
  "ReadonlySet.size",
] as const satisfies readonly SourceLibraryMemberKey[];

const arrayLengthReceiverMembers: readonly JsSurfaceReceiverPropertyMember[] = [
  arrayLengthReceiverMember({ kind: "target-array" }, "length"),
  arrayLengthReceiverMember({ kind: "target-id", id: csharpJsArrayCarrierId }, "length"),
  arrayLengthReceiverMember({ kind: "target-feature", feature: "read-only-indexable" }, "Count"),
];

const mapSizeReceiverMembers: readonly JsSurfaceReceiverPropertyMember[] = [
  collectionSizeReceiverMember(csharpJsMapCollectionPolicy.target.id, "Tsonic.CSharp.Js.Map.size"),
];

const setSizeReceiverMembers: readonly JsSurfaceReceiverPropertyMember[] = [
  collectionSizeReceiverMember(csharpJsSetCollectionPolicy.target.id, "Tsonic.CSharp.Js.Set.size"),
];

export const jsSurfacePropertyRows: readonly JsSurfacePropertyRow[] = [
  {
    identity: { prefixes: ["Console."] },
    precheck: "defer",
  },
  metadataPresencePrecheckRow({ ids: objectCallablePropertyIdentities }, objectTargetMemberIdentityIndex),
  metadataPresencePrecheckRow({ ids: jsonCallablePropertyIdentities }, jsonTargetMemberIdentityIndex),
  propertyRowFromMetadataIndex({ prefixes: ["Math."] }, mathPropertyTargetMemberIdentityIndex),
  propertyRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpPropertyTargetMemberIdentityIndex),
  propertyRowFromMetadataIndex({ prefixes: ["Number."] }, numberPropertyTargetMemberIdentityIndex),
  propertyRowFromMetadataIndex({ ids: ["String.length"] }, stringPropertyTargetMemberIdentityIndex),
  propertyRowFromContextualMetadata({ ids: mapSizePropertyIdentities }, receiverTargetMetadataProvider(mapSizeReceiverMembers)),
  propertyRowFromContextualMetadata({ ids: setSizePropertyIdentities }, receiverTargetMetadataProvider(setSizeReceiverMembers)),
  propertyRowFromContextualMetadata({ ids: arrayLengthPropertyIdentities }, receiverTargetMetadataProvider(arrayLengthReceiverMembers)),
];

function propertyRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfacePropertyRow {
  return {
    identity,
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
  };
}

function propertyRowFromContextualMetadata(
  identity: JsSurfaceSourceIdentitySelector,
  resolver: JsSurfacePropertyTargetProviderResolver,
): JsSurfacePropertyRow {
  return {
    identity,
    targetProviders: [contextualMetadataProvider(resolver)],
  };
}

function metadataPresencePrecheckRow(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfacePropertyRow {
  return {
    identity,
    precheck: targetMemberExistsPrecheck(metadataIndexProvider(membersBySourceIdentity)),
  };
}

function targetMemberExistsPrecheck(
  targetProvider: JsSurfacePropertyTargetProvider,
): JsSurfacePropertyPrecheck {
  return {
    kind: "target-member-exists",
    targetProvider,
  };
}

function metadataIndexProvider(
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfacePropertyTargetProvider {
  return {
    kind: "metadata-index",
    membersBySourceIdentity,
  };
}

function contextualMetadataProvider(
  resolver: JsSurfacePropertyTargetProviderResolver,
): JsSurfacePropertyTargetProvider {
  return {
    kind: "contextual-metadata",
    resolver,
  };
}

function receiverTargetMetadataProvider(
  receiverMembers: readonly JsSurfaceReceiverPropertyMember[],
): JsSurfacePropertyTargetProviderResolver {
  return {
    id: "receiver-target-metadata",
    selectTargetMembers: (request) => {
      const member = selectReceiverPropertyMember(receiverMembers, request.receiverType);
      return member === undefined ? [] : [member];
    },
  };
}

function selectReceiverPropertyMember(
  members: readonly JsSurfaceReceiverPropertyMember[],
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const match = members.find((member) => receiverPropertySelectorMatches(member.receiver, receiverType));
  if (match === undefined) {
    return undefined;
  }
  return {
    ...match.member,
    ...(match.useReceiverAsDeclaringType === true && receiverType !== undefined ? { declaringType: receiverType } : {}),
  };
}

function receiverPropertySelectorMatches(
  selector: JsSurfaceReceiverPropertySelector,
  receiverType: TargetTypeRef | undefined,
): boolean {
  switch (selector.kind) {
    case "target-array":
      return receiverType?.kind === "array";
    case "target-id":
      return receiverType?.kind === "target-named" && receiverType.id === selector.id;
    case "target-feature":
      return selector.feature === "read-only-indexable" && isCsharpReadOnlyIndexableCollectionTargetType(receiverType);
  }
}

function arrayLengthReceiverMember(
  receiver: JsSurfaceReceiverPropertySelector,
  targetName: string,
): JsSurfaceReceiverPropertyMember {
  return {
    receiver,
    member: {
      id: "tsonic.csharp.js.Array.length",
      sourceName: "length",
      targetName,
      kind: "property",
      parameters: [],
      returnType: int32PropertyReturnType,
    },
  };
}

function collectionSizeReceiverMember(
  targetId: string,
  memberId: string,
): JsSurfaceReceiverPropertyMember {
  return {
    receiver: { kind: "target-id", id: targetId },
    useReceiverAsDeclaringType: true,
    member: {
      id: memberId,
      sourceName: "size",
      targetName: "size",
      kind: "property",
      parameters: [],
      returnType: int32PropertyReturnType,
    },
  };
}
