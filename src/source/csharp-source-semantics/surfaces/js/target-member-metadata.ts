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

export function jsSurfaceTargetMemberMetadataIndex(
  metadata: readonly JsSurfaceTargetMemberMetadata[],
): ReadonlyMap<string, readonly TargetMember[]> {
  const index = new Map<string, TargetMember[]>();
  for (const record of metadata) {
    const existing = index.get(record.sourceName);
    const member = targetMemberFromMetadata(record);
    if (existing === undefined) {
      index.set(record.sourceName, [member]);
    } else {
      existing.push(member);
    }
  }
  return index;
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

export function jsSurfaceTargetMembersForSourceMember(
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  sourceMember: SourceLibraryMember,
): readonly TargetMember[] {
  return index.get(sourceMember.id) ?? [];
}

export function jsSurfaceSingleTargetMemberForSourceMember(
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  sourceMember: SourceLibraryMember,
): TargetMember | undefined {
  const members = jsSurfaceTargetMembersForSourceMember(index, sourceMember);
  return members.length === 1 ? members[0] : undefined;
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

function jsSurfaceSourceMemberKey(
  declaringName: SourceLibraryDeclaringKey,
  sourceName: string,
): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
