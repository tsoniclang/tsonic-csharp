import type {
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../target-types.js";
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
  readonly identity?: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[];
  readonly sourceName: string;
  readonly targetName: string;
  readonly kind: "constructor" | "method" | "property";
  readonly parameters?: readonly TargetParameter[];
  readonly returnType: TargetTypeRef;
  readonly declaringType?: TargetTypeRef;
  readonly static?: boolean;
  readonly receiverPassing?: CsharpTargetMember["receiverPassing"];
  readonly typeParameters?: readonly TargetTypeParameter[];
  readonly capabilityId?: string;
  readonly requiredFacts?: readonly string[];
  readonly semanticEquivalence?: string;
  readonly csharpCallFinalization?: CsharpTargetMember["csharpCallFinalization"];
  readonly csharpDeferredTargetSelection?: CsharpTargetMember["csharpDeferredTargetSelection"];
}

export type JsSurfaceTargetMemberMetadataWithIdentity =
  JsSurfaceTargetMemberMetadata & { readonly identity: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[] };

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
  metadata: readonly JsSurfaceTargetMemberMetadataWithIdentity[],
): ReadonlyMap<SourceLibraryMemberKey, readonly CsharpTargetMember[]> {
  const index = new Map<SourceLibraryMemberKey, CsharpTargetMember[]>();
  for (const record of metadata) {
    for (const identity of exactSourceIdentityKeys(record.identity)) {
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

export function jsSurfaceTargetMemberMetadataWithSourceIdentity(
  declaringName: SourceLibraryDeclaringKey,
  metadata: readonly JsSurfaceTargetMemberMetadata[],
): readonly JsSurfaceTargetMemberMetadataWithIdentity[] {
  return metadata.map((record) => ({
    ...record,
    identity: jsSurfaceSourceMemberIdentity(declaringName, record.sourceName),
  }));
}

export function jsSurfaceTargetMemberMetadataWithSourceIdentities(
  declaringNames: readonly SourceLibraryDeclaringKey[],
  metadata: readonly JsSurfaceTargetMemberMetadata[],
): readonly JsSurfaceTargetMemberMetadataWithIdentity[] {
  return metadata.map((record) => ({
    ...record,
    identity: declaringNames.map((declaringName) => jsSurfaceSourceMemberIdentity(declaringName, record.sourceName)),
  }));
}

export function jsSurfaceTargetMembersForSelectedSourceIdentity(
  index: ReadonlyMap<SourceLibraryMemberKey, readonly CsharpTargetMember[]>,
  identity: JsSurfaceSelectedSourceIdentity,
): readonly CsharpTargetMember[] {
  return index.get(identity.key) ?? [];
}

export function jsSurfaceTargetMemberFromMetadata(record: JsSurfaceTargetMemberMetadata): CsharpTargetMember {
  const sourceIdentityKeys = record.identity === undefined || sourceIdentityHasPrefixes(record.identity)
    ? []
    : exactSourceIdentityKeys(record.identity);
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
    ...(record.csharpCallFinalization !== undefined ? { csharpCallFinalization: record.csharpCallFinalization } : {}),
    ...(record.csharpDeferredTargetSelection !== undefined ? { csharpDeferredTargetSelection: record.csharpDeferredTargetSelection } : {}),
    ...(sourceIdentityKeys.length === 0 ? {} : { sourceIdentityKeys }),
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

function exactSourceIdentityKeys(
  selectors: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[],
): readonly SourceLibraryMemberKey[] {
  const keys: SourceLibraryMemberKey[] = [];
  const selectorList = sourceIdentitySelectorsAreArray(selectors) ? selectors : [selectors];
  for (const selector of selectorList) {
    if (selector.prefixes !== undefined) {
      throw new Error("JS surface target member metadata identity index requires exact source identity ids, not prefixes");
    }
    if (selector.ids === undefined) {
      throw new Error("JS surface target member metadata identity index requires source identity ids");
    }
    if (sourceIdentityIdsAreArray(selector.ids)) {
      keys.push(...selector.ids);
    } else {
      keys.push(...selector.ids);
    }
  }
  return keys;
}

function sourceIdentityHasPrefixes(
  selectors: JsSurfaceSourceIdentitySelector | readonly JsSurfaceSourceIdentitySelector[],
): boolean {
  const selectorList = sourceIdentitySelectorsAreArray(selectors) ? selectors : [selectors];
  return selectorList.some((selector) => selector.prefixes !== undefined);
}

function jsSurfaceSourceMemberIdentity(
  declaringName: SourceLibraryDeclaringKey,
  sourceName: string,
): JsSurfaceSourceIdentitySelector {
  return { ids: [`${declaringName}.${sourceName}`] };
}
