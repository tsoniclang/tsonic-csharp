import type {
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";

export interface JsSurfaceTargetMemberMetadata {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly kind: "method" | "property";
  readonly parameters?: readonly TargetParameter[];
  readonly returnType: TargetTypeRef;
  readonly declaringType?: TargetTypeRef;
  readonly static?: boolean;
  readonly receiverPassing?: TargetMember["receiverPassing"];
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

export function jsSurfaceTargetMembersForSourceName(
  index: ReadonlyMap<string, readonly TargetMember[]>,
  sourceName: string,
): readonly TargetMember[] {
  return index.get(sourceName) ?? [];
}

function targetMemberFromMetadata(record: JsSurfaceTargetMemberMetadata): TargetMember {
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
  };
}
