import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";
import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

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
  readonly stride: bigint;
}

export interface CsharpStorageClassifications extends CsharpStorageRepresentationClassifications {
  readonly nativeModuleField: { readonly get: (declaration: Node) => boolean };
  readonly nativeLocation: { readonly get: (expression: Node) => import("./native-locations.js").CsharpNativeLocationSelection | undefined };
  readonly closedNativeContracts: readonly TargetTypeRef[];
  readonly nativeArrays: readonly { readonly subject: Node; readonly storage: CsharpNativeArrayStorage }[];
  readonly nativeArray: { readonly get: (subject: Node) => CsharpNativeArrayStorage | undefined };
  readonly nativeFields: readonly CsharpNativeObjectField[];
  readonly nativeField: { readonly get: (owner: TargetTypeRef, memberName: string) => CsharpNativeObjectField | undefined };
  readonly nativeBackings: readonly { readonly subject: Node; readonly layout: import("../operations/native-memory.js").CsharpNativeMemoryLayout }[];
  readonly nativeBacking: { readonly get: (subject: Node) => import("../operations/native-memory.js").CsharpNativeMemoryLayout | undefined };
}

export interface CsharpStorageRepresentationClassifications {
  readonly issues: readonly CsharpStorageIssue[];
  readonly contracts: readonly CsharpStorageContractClassification[];
  readonly storageType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly requiredStorageType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly lambdaParameterType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly typedLocationIdentity: { readonly get: (declaration: Node) => boolean };
}

export interface CsharpStorageContractClassification {
  readonly declaration: Node;
  readonly targetType?: TargetTypeRef;
  readonly lambdaParameterType?: TargetTypeRef;
  readonly nullableWrittenType?: TargetTypeRef;
  readonly type: TargetTypeRef;
  readonly typedLocationIdentity: boolean;
}
