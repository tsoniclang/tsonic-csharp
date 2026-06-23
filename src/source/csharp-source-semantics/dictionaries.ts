import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetEnrichmentHost,
} from "./target-enrichment.js";
import {
  enrichCsharpTargetMember,
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./target-types.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";

export const csharpDictionaryTargetId = "System.Collections.Generic.Dictionary`2";

export type CsharpRecordDictionaryTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpCollectionSurface: "record";
};

export function getCsharpRecordDictionaryTargetType(
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
  host: CsharpTargetEnrichmentHost,
): CsharpRecordDictionaryTargetTypeRef | undefined {
  const binding = host.getCsharpTargetBindingByTargetId(csharpDictionaryTargetId);
  if (binding === undefined) {
    return undefined;
  }
  const targetType = getCsharpTargetTypeFromBinding(binding, [keyType, valueType], host);
  return targetType?.kind === "target-named"
    ? {
        ...targetType,
        csharpCollectionSurface: "record",
      } satisfies CsharpRecordDictionaryTargetTypeRef
    : undefined;
}

export function isCsharpRecordDictionaryTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpRecordDictionaryTargetTypeRef {
  return type?.kind === "target-named" &&
    type.id === csharpDictionaryTargetId &&
    (type as Partial<CsharpRecordDictionaryTargetTypeRef>).csharpCollectionSurface === "record";
}

export function getCsharpRecordDictionaryIndexerTargetMembers(
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
  host: CsharpTargetEnrichmentHost,
): readonly TargetMember[] {
  const binding = host.getCsharpTargetBindingByTargetId(dictionaryType.id);
  return (binding?.members ?? [])
    .filter((member) => member.kind === "indexer")
    .map((member) => enrichCsharpTargetMember(member, host, { declaringTargetType: dictionaryType }))
    .filter((member): member is TargetMember => member !== undefined && targetMemberIsClosed(member));
}
