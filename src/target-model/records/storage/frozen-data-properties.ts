import type { CsharpObjectShapeFact } from "../../types/model.js";

export type CsharpFrozenDataProperty = { readonly kind: "setter" } | { readonly kind: "data"; readonly storageName: string };

export interface CsharpFrozenDataPropertyRecords {
  readonly frozenDataProperties: { readonly get: (shape: CsharpObjectShapeFact) => ReadonlyMap<string, CsharpFrozenDataProperty> | undefined };
}
