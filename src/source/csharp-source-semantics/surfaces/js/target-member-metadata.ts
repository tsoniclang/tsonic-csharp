import type {
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryDeclaringKey,
  SourceLibraryMember,
  SourceLibraryMemberKey,
  SourceLibraryMemberKeyPrefix,
} from "./source-library.js";
import {
  sourceLibraryMemberIdentity,
} from "./source-library.js";

export interface JsSurfaceTargetMemberMetadata {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly kind: "constructor" | "method" | "property";
  readonly parameters?: readonly TargetParameter[];
  readonly returnType: TargetTypeRef;
  readonly declaringType?: TargetTypeRef;
  readonly static?: boolean;
  readonly receiverPassing?: TargetMember["receiverPassing"];
  readonly typeParameters?: readonly TargetTypeParameter[];
}

export interface JsSurfaceSelectedSourceIdentity {
  readonly key: SourceLibraryMemberKey;
}

export interface JsSurfaceSourceIdentitySelector {
  readonly ids?: ReadonlySet<SourceLibraryMemberKey> | readonly SourceLibraryMemberKey[];
  readonly prefixes?: readonly SourceLibraryMemberKeyPrefix[];
}

export function jsSurfaceSelectedSourceIdentityForMember(
  sourceMember: SourceLibraryMember,
): JsSurfaceSelectedSourceIdentity {
  return { key: sourceLibraryMemberIdentity(sourceMember) };
}

export function jsSurfaceSourceIdentityMatchesSelector(
  identity: JsSurfaceSelectedSourceIdentity,
  selector: JsSurfaceSourceIdentitySelector,
): boolean {
  return (selector.ids === undefined || sourceIdentityIdsContain(selector.ids, identity.key)) &&
    (selector.prefixes === undefined || selector.prefixes.some((prefix) => identity.key.startsWith(prefix)));
}

export function jsSurfaceSourceIdentityMatchesAnySelector(
  identity: JsSurfaceSelectedSourceIdentity,
  selectors: readonly JsSurfaceSourceIdentitySelector[],
): boolean {
  return selectors.some((selector) => jsSurfaceSourceIdentityMatchesSelector(identity, selector));
}

export function jsSurfaceSelectMetadataRowForSourceIdentity<T>(
  rows: readonly T[],
  identity: JsSurfaceSelectedSourceIdentity,
  selectorsForRow: (row: T) => JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[] = defaultSourceIdentitySelectorForRow,
): T | undefined {
  for (const row of rows) {
    const selectors = selectorsForRow(row);
    if (sourceIdentitySelectorsAreArray(selectors)
      ? jsSurfaceSourceIdentityMatchesAnySelector(identity, selectors)
      : jsSurfaceSourceIdentityMatchesSelector(identity, selectors)) {
      return row;
    }
  }
  return undefined;
}

export function jsSurfaceTargetMemberMetadataIdentityIndex(
  declaringName: SourceLibraryDeclaringKey,
  metadata: readonly JsSurfaceTargetMemberMetadata[],
): ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]> {
  return jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames([declaringName], metadata);
}

export function jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(
  declaringNames: readonly SourceLibraryDeclaringKey[],
  metadata: readonly JsSurfaceTargetMemberMetadata[],
): ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]> {
  const index = new Map<SourceLibraryMemberKey, TargetMember[]>();
  for (const record of metadata) {
    for (const declaringName of declaringNames) {
      const identity = jsSurfaceSourceMemberKey(declaringName, record.sourceName);
      const existing = index.get(identity);
      const member = targetMemberFromMetadata(record);
      if (existing === undefined) {
        index.set(identity, [member]);
      } else {
        existing.push(member);
      }
    }
  }
  return index;
}

export function jsSurfaceTargetMembersForSelectedSourceIdentity(
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  identity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return index.get(identity.key) ?? [];
}

export function jsSurfaceTargetMemberFromMetadata(record: JsSurfaceTargetMemberMetadata): TargetMember {
  return {
    id: record.id,
    sourceName: record.sourceName,
    targetName: record.targetName,
    kind: record.kind,
    parameters: record.parameters ?? [],
    returnType: record.returnType,
    ...(record.declaringType !== undefined ? { declaringType: record.declaringType } : {}),
    ...(record.static !== undefined ? { static: record.static } : {}),
    ...(record.receiverPassing !== undefined ? { receiverPassing: record.receiverPassing } : {}),
    ...(record.typeParameters !== undefined ? { typeParameters: record.typeParameters } : {}),
  };
}

const targetMemberFromMetadata = jsSurfaceTargetMemberFromMetadata;

function defaultSourceIdentitySelectorForRow<T>(
  row: T,
): JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[] {
  return (row as { readonly identity: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[] }).identity;
}

function sourceIdentityIdsContain(
  ids: ReadonlySet<SourceLibraryMemberKey> | readonly SourceLibraryMemberKey[],
  key: SourceLibraryMemberKey,
): boolean {
  return sourceIdentityIdsAreArray(ids) ? ids.includes(key) : ids.has(key);
}

function sourceIdentitySelectorsAreArray(
  selectors: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[],
): selectors is readonly JsSurfaceSourceIdentitySelector[] {
  return Array.isArray(selectors);
}

function sourceIdentityIdsAreArray(
  ids: ReadonlySet<SourceLibraryMemberKey> | readonly SourceLibraryMemberKey[],
): ids is readonly SourceLibraryMemberKey[] {
  return Array.isArray(ids);
}

function jsSurfaceSourceMemberKey(
  declaringName: SourceLibraryDeclaringKey,
  sourceName: string,
): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
