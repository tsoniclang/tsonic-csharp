import type { TargetTypeRef, CsharpObjectShapeFact } from "../types/model.js";

export interface CsharpTypeEmission {
  readonly objectShapes: readonly CsharpObjectShapeFact[];
}

export interface CsharpTypeEmissionRecords {
  readonly typeEmission: { readonly get: (carrier: TargetTypeRef) => CsharpTypeEmission | undefined };
}
