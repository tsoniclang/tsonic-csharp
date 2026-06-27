import type {
  TargetMember,
} from "@tsonic/tsts";
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
  fixedKindRow("Map.size", "collection-size"),
  fixedKindRow("ReadonlyMap.size", "collection-size"),
  fixedKindRow("Set.size", "collection-size"),
  fixedKindRow("ReadonlySet.size", "collection-size"),
  fixedKindRow("String.length", "string-length"),
  fixedKindRow("Array.length", "array-length"),
  fixedKindRow("ReadonlyArray.length", "array-length"),
];

export const propertyMemberProviderBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, CsharpJsPropertyMemberProvider> =
  new Map(propertyMemberRows.map((provider) => [provider.sourceId, provider]));

export const int32PropertyReturnType = csharpSourcePrimitiveTargetType("int32");

function fixedMetadataRow(
  sourceId: SourceLibraryMemberKey,
  members: readonly TargetMember[],
): CsharpJsPropertyMemberProvider {
  return {
    sourceId,
    member: { kind: "metadata-row", members },
  };
}

function fixedMetadataRowFromIndex(
  sourceId: SourceLibraryMemberKey,
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): CsharpJsPropertyMemberProvider {
  return fixedMetadataRow(sourceId, index.get(sourceId) ?? []);
}

function fixedKindRow(
  sourceId: SourceLibraryMemberKey,
  kind: Extract<CsharpJsPropertyMemberProvider["member"], { readonly kind: "collection-size" | "string-length" | "array-length" }>["kind"],
): CsharpJsPropertyMemberProvider {
  return {
    sourceId,
    member: { kind },
  };
}

function sourceKey(
  declaringName: "Math" | "RegExp" | "Number",
  sourceName: string,
): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
