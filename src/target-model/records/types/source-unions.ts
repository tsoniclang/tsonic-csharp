import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/model.js";

export interface CsharpSourceUnionEmission {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly arms: readonly TargetTypeRef[];
  readonly parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly single: boolean;
  readonly storage: TargetTypeRef;
  readonly resultName: string;
}

export interface CsharpSourceUnionEmissionRecords {
  readonly sourceUnions: { readonly get: () => readonly CsharpSourceUnionEmission[] };
}
