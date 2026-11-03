import type { SourceFile, Type } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../types/generic-constraints.js";
import type { createCsharpMetadataBudget } from "../../metadata/immutable.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

export interface CsharpTypeParameterSourceEvidence {
  readonly sourceFile: SourceFile;
  readonly sourceType: Type;
}

export type CsharpTypeParameterSnapshot = TypeParameter & {
  readonly csharpConstraints: CsharpTypeParameterConstraintResolution;
};

export interface CsharpTypeParameterEnvironment {
  resolve(
    parameter: TypeParameter,
    source?: CsharpTypeParameterSourceEvidence,
    budget?: ReturnType<typeof createCsharpMetadataBudget>,
  ): CsharpTypeParameterSnapshot;
}
