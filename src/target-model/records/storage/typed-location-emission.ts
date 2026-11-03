import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpTypedLocationStorage } from "./typed-location-storage.js";
import type { CsharpResolvedTypedLocationOperation } from "./typed-locations.js";
import type { CsharpNativeLocationSelection } from "../native/native-locations.js";

export interface CsharpTypedStorageEmission {
  readonly carrier: TargetTypeRef;
  readonly address: { readonly kind: "managed" | "native-array" | "native-local" } | { readonly kind: "native-field"; readonly name: string };
  readonly bound: { readonly name: string; readonly carrier: TargetTypeRef } | undefined;
}

export interface CsharpTypedLocationEmission {
  readonly selection: CsharpResolvedTypedLocationOperation;
  readonly storeAddress: Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }> | undefined;
  readonly suspends: boolean;
}

export interface CsharpTypedLocationEmissionRecords {
  readonly typedStorageEmission: { readonly get: (storage: CsharpTypedLocationStorage) => CsharpTypedStorageEmission | undefined };
  readonly typedLocationEmission: { readonly get: (node: Node) => CsharpTypedLocationEmission | undefined };
}
