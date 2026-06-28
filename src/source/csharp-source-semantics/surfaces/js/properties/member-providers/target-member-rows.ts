import type {
  TargetMember,
} from "@tsonic/tsts";
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
  JsSurfacePropertyReceiverFacts,
  JsSurfacePropertyRow,
  JsSurfacePropertyTargetProvider,
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

const alwaysReceiverFacts = {
  requirement: { kind: "always" },
} as const satisfies JsSurfacePropertyReceiverFacts;

const selectedPropertyFacts = [
  "selected source property identity",
  "closed receiver target facts required by the selected metadata row",
  "provider/runtime property metadata row",
] as const;

const stringReceiverFacts = {
  requirement: { kind: "host", predicate: "isCsharpStringType" },
} as const satisfies JsSurfacePropertyReceiverFacts;

const regexpReceiverFacts = {
  requirement: { kind: "target-type-id", id: "Tsonic.CSharp.Js.RegExp" },
} as const satisfies JsSurfacePropertyReceiverFacts;

const numberStaticReceiverFacts = alwaysReceiverFacts;

const arrayLengthReceiverFacts = {
  seedRequired: true,
  finalCarrierSelection: true,
  requirement: { kind: "array-like" },
} as const satisfies JsSurfacePropertyReceiverFacts;

const mapSizeReceiverFacts = {
  seedRequired: true,
  requirement: { kind: "target-type-id", id: csharpJsMapCollectionPolicy.target.id },
} as const satisfies JsSurfacePropertyReceiverFacts;

const setSizeReceiverFacts = {
  seedRequired: true,
  requirement: { kind: "target-type-id", id: csharpJsSetCollectionPolicy.target.id },
} as const satisfies JsSurfacePropertyReceiverFacts;

const arrayLengthReceiverMembers: readonly JsSurfaceReceiverPropertyMember[] = [
  receiverPropertyMember({ kind: "target-array" }, arrayLengthTargetMember("Length")),
  receiverPropertyMember({ kind: "target-id", id: csharpJsArrayCarrierId }, arrayLengthTargetMember("length")),
  receiverPropertyMember({ kind: "target-feature", feature: "read-only-indexable" }, arrayLengthTargetMember("Count")),
];

export const jsSurfacePropertyRows: readonly JsSurfacePropertyRow[] = [
  {
    identity: { prefixes: ["Console."] },
    precheck: "defer",
  },
  metadataPresencePrecheckRow({ ids: objectCallablePropertyIdentities }, objectTargetMemberIdentityIndex, "surface.js.object-runtime"),
  metadataPresencePrecheckRow({ ids: jsonCallablePropertyIdentities }, jsonTargetMemberIdentityIndex, "surface.js.math-json-regexp"),
  propertyRowFromMetadataIndex({ prefixes: ["Math."] }, mathPropertyTargetMemberIdentityIndex, alwaysReceiverFacts, "surface.js.math"),
  propertyRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpPropertyTargetMemberIdentityIndex, regexpReceiverFacts, "surface.js.math-json-regexp"),
  propertyRowFromMetadataIndex({ prefixes: ["Number."] }, numberPropertyTargetMemberIdentityIndex, numberStaticReceiverFacts, "surface.js.number-methods"),
  propertyRowFromMetadataIndex({ ids: ["String.length"] }, stringPropertyTargetMemberIdentityIndex, stringReceiverFacts, "surface.js.string-methods"),
  propertyRowFromCollectionMetadata({ ids: mapSizePropertyIdentities }, mapSizeReceiverFacts),
  propertyRowFromCollectionMetadata({ ids: setSizePropertyIdentities }, setSizeReceiverFacts),
  propertyRowFromReceiverMetadata({ ids: arrayLengthPropertyIdentities }, arrayLengthReceiverMembers, arrayLengthReceiverFacts, {
    deferredResultType: int32PropertyReturnType,
  }),
];

function propertyRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  receiverFacts?: JsSurfacePropertyReceiverFacts,
  capabilityId?: string,
): JsSurfacePropertyRow {
  return {
    identity,
    ...(receiverFacts === undefined ? {} : { receiverFacts }),
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
    ...(capabilityId === undefined ? {} : { capabilityId }),
    requiredFacts: selectedPropertyFacts,
  };
}

function propertyRowFromCollectionMetadata(
  identity: JsSurfaceSourceIdentitySelector,
  receiverFacts: JsSurfacePropertyReceiverFacts,
): JsSurfacePropertyRow {
  return {
    identity,
    receiverFacts,
    targetProviders: [collectionMetadataProvider()],
  };
}

function propertyRowFromReceiverMetadata(
  identity: JsSurfaceSourceIdentitySelector,
  members: readonly JsSurfaceReceiverPropertyMember[],
  receiverFacts: JsSurfacePropertyReceiverFacts,
  options: { readonly deferredResultType?: TargetMember["returnType"] } = {},
): JsSurfacePropertyRow {
  return {
    identity,
    receiverFacts,
    targetProviders: [receiverMemberProvider(members)],
    ...(options.deferredResultType !== undefined ? { deferredResultType: options.deferredResultType } : {}),
  };
}

function metadataPresencePrecheckRow(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  capabilityId?: string,
): JsSurfacePropertyRow {
  return {
    identity,
    precheck: targetMemberExistsPrecheck(metadataIndexProvider(membersBySourceIdentity)),
    ...(capabilityId === undefined ? {} : { capabilityId }),
    requiredFacts: ["selected source property identity", "provider/runtime callable metadata row"],
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

function collectionMetadataProvider(): JsSurfacePropertyTargetProvider {
  return {
    kind: "collection-metadata",
  };
}

function receiverMemberProvider(
  members: readonly JsSurfaceReceiverPropertyMember[],
): JsSurfacePropertyTargetProvider {
  return {
    kind: "receiver-member",
    members,
  };
}

function receiverPropertyMember(
  receiver: JsSurfaceReceiverPropertySelector,
  member: TargetMember,
): JsSurfaceReceiverPropertyMember {
  return {
    receiver,
    member,
  };
}

function arrayLengthTargetMember(targetName: string): TargetMember {
  return {
    id: "tsonic.csharp.js.Array.length",
    sourceName: "length",
    targetName,
    kind: "property",
    parameters: [],
    returnType: int32PropertyReturnType,
  };
}
