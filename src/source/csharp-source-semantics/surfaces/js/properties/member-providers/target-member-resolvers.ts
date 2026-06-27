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
  stringPropertyTargetMemberIdentityIndex,
} from "../../strings.js";
import {
  mathPropertyTargetMemberIdentityIndex,
} from "../../math.js";
import {
  numberPropertyTargetMemberIdentityIndex,
} from "../../numbers.js";
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
  CsharpJsPropertyMemberProvider,
  CsharpJsReceiverPropertyMember,
} from "./types.js";

const mathPropertySourceNames = [
  "E",
  "PI",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "SQRT1_2",
  "SQRT2",
] as const;

const regExpStringPropertySourceNames = [
  "source",
  "flags",
] as const;

const regExpBooleanPropertySourceNames = [
  "global",
  "hasIndices",
  "ignoreCase",
  "multiline",
  "dotAll",
  "unicode",
  "unicodeSets",
  "sticky",
] as const;

const numberPropertySourceNames = [
  "MAX_VALUE",
  "MIN_VALUE",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "POSITIVE_INFINITY",
  "NEGATIVE_INFINITY",
  "NaN",
  "EPSILON",
] as const;

export const int32PropertyReturnType = csharpSourcePrimitiveTargetType("int32");

const arrayLengthReceiverMembers: readonly CsharpJsReceiverPropertyMember[] = [
  arrayLengthReceiverMember({ kind: "target-array" }, "length"),
  arrayLengthReceiverMember({ kind: "target-id", id: csharpJsArrayCarrierId }, "length"),
  arrayLengthReceiverMember({ kind: "target-feature", feature: "read-only-indexable" }, "Count"),
];

const propertyMemberRows: readonly CsharpJsPropertyMemberProvider[] = [
  ...mathPropertySourceNames.map((sourceName) =>
    fixedMetadataRowFromIndex(sourceKey("Math", sourceName), mathPropertyTargetMemberIdentityIndex)
  ),
  ...regExpStringPropertySourceNames.map((sourceName) =>
    fixedMetadataRowFromIndex(sourceKey("RegExp", sourceName), regExpPropertyTargetMemberIdentityIndex)
  ),
  ...regExpBooleanPropertySourceNames.map((sourceName) =>
    fixedMetadataRowFromIndex(sourceKey("RegExp", sourceName), regExpPropertyTargetMemberIdentityIndex)
  ),
  fixedMetadataRowFromIndex("RegExp.lastIndex", regExpPropertyTargetMemberIdentityIndex),
  ...numberPropertySourceNames.map((sourceName) =>
    fixedMetadataRowFromIndex(sourceKey("Number", sourceName), numberPropertyTargetMemberIdentityIndex)
  ),
  fixedReceiverMetadataRow("Map.size", [collectionSizeReceiverMember(csharpJsMapCollectionPolicy.target.id, "Tsonic.CSharp.Js.Map.size")]),
  fixedReceiverMetadataRow("ReadonlyMap.size", [collectionSizeReceiverMember(csharpJsMapCollectionPolicy.target.id, "Tsonic.CSharp.Js.Map.size")]),
  fixedReceiverMetadataRow("Set.size", [collectionSizeReceiverMember(csharpJsSetCollectionPolicy.target.id, "Tsonic.CSharp.Js.Set.size")]),
  fixedReceiverMetadataRow("ReadonlySet.size", [collectionSizeReceiverMember(csharpJsSetCollectionPolicy.target.id, "Tsonic.CSharp.Js.Set.size")]),
  fixedMetadataRowFromIndex("String.length", stringPropertyTargetMemberIdentityIndex),
  fixedReceiverMetadataRow("Array.length", arrayLengthReceiverMembers),
  fixedReceiverMetadataRow("ReadonlyArray.length", arrayLengthReceiverMembers),
];

export const propertyMemberProviderBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, CsharpJsPropertyMemberProvider> =
  new Map(propertyMemberRows.map((provider) => [provider.sourceId, provider]));

function fixedMetadataRow(
  sourceId: SourceLibraryMemberKey,
  members: readonly TargetMember[],
): CsharpJsPropertyMemberProvider {
  return {
    sourceId,
    member: { members },
  };
}

function fixedMetadataRowFromIndex(
  sourceId: SourceLibraryMemberKey,
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): CsharpJsPropertyMemberProvider {
  return fixedMetadataRow(sourceId, index.get(sourceId) ?? []);
}

function fixedReceiverMetadataRow(
  sourceId: SourceLibraryMemberKey,
  receiverMembers: readonly CsharpJsReceiverPropertyMember[],
): CsharpJsPropertyMemberProvider {
  return {
    sourceId,
    member: { receiverMembers },
  };
}

function arrayLengthReceiverMember(
  receiver: CsharpJsReceiverPropertyMember["receiver"],
  targetName: string,
): CsharpJsReceiverPropertyMember {
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
): CsharpJsReceiverPropertyMember {
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

function sourceKey(
  declaringName: "Math" | "RegExp" | "Number",
  sourceName: string,
): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
