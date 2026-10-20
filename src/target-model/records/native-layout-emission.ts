import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";
import type { TargetTypeRef } from "../types/model.js";

export interface CsharpNativeLayoutEmission {
  readonly owner: TargetTypeRef;
  readonly fields: readonly string[];
  readonly array: { readonly element: TargetTypeRef; readonly length: number } | undefined;
  readonly hasWrites: boolean;
}

export interface CsharpNativeLayoutRecords {
  readonly nativeLayoutEmission: { readonly get: (layout: CsharpNativeMemoryLayout) => CsharpNativeLayoutEmission | undefined };
}
