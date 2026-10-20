import type { CsharpTargetMember, TargetTypeRef } from "../model.js";

export type CsharpCollectionElementRead =
  | { readonly kind: "indexer"; readonly element: TargetTypeRef }
  | { readonly kind: "method"; readonly element: TargetTypeRef; readonly member: CsharpTargetMember }
  | { readonly kind: "invalid"; readonly reason: string };
