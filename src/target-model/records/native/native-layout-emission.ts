import type { CsharpNativeMemoryLayout } from "../../operations/native-memory.js";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpNativeLayoutEmission {
  readonly owner: TargetTypeRef;
  readonly memoryOwner: TargetTypeRef;
  readonly scalarFactory: TargetTypeRef | undefined;
  readonly arrayStorage: TargetTypeRef | undefined;
  readonly fields: readonly string[];
  readonly array: { readonly element: TargetTypeRef; readonly length: number } | undefined;
  readonly hasWrites: boolean;
}

export interface CsharpNativeLayoutRecords {
  readonly nativeLayoutEmission: { readonly get: (layout: CsharpNativeMemoryLayout) => CsharpNativeLayoutEmission | undefined };
}
