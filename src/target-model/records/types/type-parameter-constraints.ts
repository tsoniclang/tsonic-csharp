import type { SourceFile } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";

import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../types/generic-constraints.js";
import type { createCsharpMetadataBudget } from "../../metadata/immutable.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

export interface CsharpTypeParameterSourceEvidence {
  readonly sourceFile: SourceFile;
  /** The published descriptor bound to the type parameter at this use (instantiation or declared type). */
  readonly sourceType: SourceTypeDescriptor;
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
