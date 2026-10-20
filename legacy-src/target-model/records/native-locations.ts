import type { CsharpAssignmentLocation } from "../operations/assignment-locations.js";
import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpNativeArrayStorage, CsharpNativeObjectField } from "./storage.js";
import type { Node } from "@tsonic/tsts";

export type CsharpNativeLocationSelection =
  | { readonly kind: "resolved"; readonly expression: Node; readonly storageType: TargetTypeRef;
      readonly assignment: CsharpAssignmentLocation; readonly writable: boolean;
      readonly address?: CsharpNativeManagedAddress; readonly receiver?: CsharpNativeLocationReceiver;
      readonly opaque?: true;
      readonly nativeCell?: CsharpNativeCellIdentity }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpNativeManagedAddress {
  readonly passing: "byref-readonly" | "byref-readwrite";
  readonly capturedReferenceCrossesSuspension: false;
}

export interface CsharpNativeLocationReceiver {
  readonly expression: Node;
  readonly storageType: TargetTypeRef;
  readonly address: CsharpNativeManagedAddress;
}

export type CsharpNativeCellIdentity =
  | { readonly kind: "local"; readonly layout: CsharpNativeMemoryLayout }
  | { readonly kind: "field"; readonly backing: CsharpNativeObjectField }
  | { readonly kind: "element"; readonly backing: CsharpNativeArrayStorage };
