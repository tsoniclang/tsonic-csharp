import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";

export interface CsharpNativeMemoryLayout {
  readonly pointeeType: TargetTypeRef;
  readonly size: number;
  readonly alignment: number;
  readonly width: 32 | 64;
  readonly littleEndian: boolean;
}

export function csharpNativeMemoryLayoutsEqual(left: CsharpNativeMemoryLayout, right: CsharpNativeMemoryLayout): boolean {
  return targetTypeRefEquals(left.pointeeType, right.pointeeType) && left.size === right.size &&
    left.alignment === right.alignment && left.width === right.width && left.littleEndian === right.littleEndian;
}
