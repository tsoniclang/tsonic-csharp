import type { SourceFile } from "@tsonic/tsts";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";

import type { TargetTypeRef, CsharpTypeParameterConstraintResolution } from "../../types/native-type-data.js";
import type { createCsharpMetadataBudget } from "../../metadata/immutable.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

export interface CsharpTypeParameterSourceEvidence {
  readonly sourceFile: SourceFile;
  readonly sourceType: SourceTypeEvidence;
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
