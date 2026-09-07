import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";

export interface CsharpNativeObjectField {
  readonly owner: TargetTypeRef;
  readonly memberName: string;
  readonly storageName: string;
  readonly layout: CsharpNativeMemoryLayout;
}

export interface CsharpStorageIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpNativeArrayStorage {
  readonly kind: "binding" | "reference" | "literal" | "element";
  readonly layout: CsharpNativeMemoryLayout;
  readonly stride: number;
}

export interface CsharpStorageClassifications {
  readonly nativeArrays: readonly { readonly subject: Node; readonly storage: CsharpNativeArrayStorage }[];
  nativeArray(subject: Node): CsharpNativeArrayStorage | undefined;
  readonly nativeFields: readonly CsharpNativeObjectField[];
  nativeField(owner: TargetTypeRef, memberName: string): CsharpNativeObjectField | undefined;
  readonly nativeBackings: readonly { readonly subject: Node; readonly layout: import("../../target-model/operations/native-memory.js").CsharpNativeMemoryLayout }[];
  nativeBacking(subject: Node): import("../../target-model/operations/native-memory.js").CsharpNativeMemoryLayout | undefined;
  readonly issues: readonly CsharpStorageIssue[];
  readonly contracts: readonly CsharpStorageContractClassification[];
  type(node: Node): TargetTypeRef | undefined;
  requiredType(node: Node): TargetTypeRef | undefined;
  requiresTypedLocationIdentity(declaration: Node): boolean;
}

export interface CsharpStorageContractClassification {
  readonly declaration: Node;
  readonly targetType?: TargetTypeRef;
  readonly nullableWrittenType?: TargetTypeRef;
  readonly type: TargetTypeRef;
  readonly typedLocationIdentity: boolean;
}
