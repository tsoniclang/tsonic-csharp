import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";

export interface CsharpNativeMemoryLayout {
  readonly kind: "scalar" | "record";
  readonly pointeeType: TargetTypeRef;
  readonly size: number;
  readonly alignment: number;
  readonly width: 32 | 64;
  readonly littleEndian: boolean;
  readonly fields: readonly CsharpNativeMemoryField[];
}

export interface CsharpNativeMemoryField {
  readonly name: string;
  readonly offset: number;
  readonly alignment: number;
  readonly layout: CsharpNativeMemoryLayout;
}

export function csharpNativeMemoryLayoutsEqual(left: CsharpNativeMemoryLayout, right: CsharpNativeMemoryLayout): boolean {
  const pending = [[left, right] as const];
  const visited = new Map<CsharpNativeMemoryLayout, Set<CsharpNativeMemoryLayout>>();
  while (pending.length > 0) {
    const [first, second] = pending.pop()!;
    if (visited.get(first)?.has(second)) continue;
    const compared = visited.get(first) ?? new Set<CsharpNativeMemoryLayout>();
    compared.add(second);
    visited.set(first, compared);
    if (first.kind !== second.kind || !targetTypeRefEquals(first.pointeeType, second.pointeeType) ||
      first.size !== second.size || first.alignment !== second.alignment || first.width !== second.width ||
      first.littleEndian !== second.littleEndian || first.fields.length !== second.fields.length) return false;
    for (const [index, field] of first.fields.entries()) {
      const other = second.fields[index]!;
      if (field.name !== other.name || field.offset !== other.offset || field.alignment !== other.alignment) return false;
      pending.push([field.layout, other.layout]);
    }
  }
  return true;
}
