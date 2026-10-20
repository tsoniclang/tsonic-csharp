import type { TargetTypeRef, CsharpObjectShapeFact, CsharpDelegateSignatureShape } from "../types/model.js";
import type { CsharpCollectionElementRead } from "../types/carriers/collection-reads.js";

export type CsharpOptionalStorageEmission =
  | { readonly kind: "generic"; readonly present: TargetTypeRef; readonly operations: TargetTypeRef }
  | { readonly kind: "native"; readonly present: TargetTypeRef; readonly absence: boolean; readonly jsValue: boolean };

export interface CsharpTypeEmission {
  readonly lambda: CsharpDelegateSignatureShape | undefined;
  readonly taskResult: TargetTypeRef | undefined;
  readonly completion: "value" | "void" | "never";
  readonly coalescing: "operator" | "guard";
  readonly nullable: boolean;
  readonly nullableReference: boolean;
  readonly valueType: boolean;
  readonly unionAccess: { readonly kind: "direct" | "nullable" } | { readonly kind: "generic"; readonly operations: TargetTypeRef };
  readonly collectionRead: Exclude<CsharpCollectionElementRead, { readonly kind: "invalid" }> | undefined;
  readonly collectionLength: string | undefined;
  readonly optionalStorage: CsharpOptionalStorageEmission;
  readonly unsafeContext: boolean;
  readonly objectShapes: readonly CsharpObjectShapeFact[];
}

export interface CsharpTypeEmissionRecords {
  readonly typeEmission: { readonly get: (carrier: TargetTypeRef) => CsharpTypeEmission | undefined };
}
