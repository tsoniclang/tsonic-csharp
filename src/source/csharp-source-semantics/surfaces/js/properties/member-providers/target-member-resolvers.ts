import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  mathPropertyTargetMemberForSourceMember,
} from "../../math.js";
import {
  numberPropertyTargetMemberForSourceMember,
} from "../../numbers.js";
import {
  regExpPropertyTargetMemberForSourceMember,
} from "../../regexp/index.js";
import {
  createSourceLibraryMember,
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
    fixedMetadataRow(sourceKey("Math", sourceName), singleTargetMember(mathPropertyTargetMemberForSourceMember(createSourceLibraryMember("Math", sourceName))))
  ),
  ...regExpStringPropertySourceNames.map((sourceName) =>
    fixedMetadataRow(sourceKey("RegExp", sourceName), singleTargetMember(regExpPropertyTargetMemberForSourceMember(createSourceLibraryMember("RegExp", sourceName))))
  ),
  ...regExpBooleanPropertySourceNames.map((sourceName) =>
    fixedMetadataRow(sourceKey("RegExp", sourceName), singleTargetMember(regExpPropertyTargetMemberForSourceMember(createSourceLibraryMember("RegExp", sourceName))))
  ),
  fixedMetadataRow("RegExp.lastIndex", singleTargetMember(regExpPropertyTargetMemberForSourceMember(createSourceLibraryMember("RegExp", "lastIndex")))),
  ...numberPropertySourceNames.map((sourceName) =>
    fixedMetadataRow(sourceKey("Number", sourceName), singleTargetMember(numberPropertyTargetMemberForSourceMember(createSourceLibraryMember("Number", sourceName))))
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

function singleTargetMember(
  member: TargetMember | undefined,
): readonly TargetMember[] {
  return member === undefined ? [] : [member];
}
