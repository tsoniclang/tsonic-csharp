import type { CsharpNativeMemoryLayout } from "../../operations/native-memory.js";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpNativeObjectField {
  readonly owner: TargetTypeRef;
  readonly memberName: string;
  readonly storageName: string;
  readonly layout: CsharpNativeMemoryLayout;
}

export interface CsharpNativeArrayStorage {
  readonly kind: "binding" | "reference" | "literal" | "element";
  readonly layout: CsharpNativeMemoryLayout;
  readonly stride: bigint;
}
