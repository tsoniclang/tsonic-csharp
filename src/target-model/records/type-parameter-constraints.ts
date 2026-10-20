import type { SourceFile, Type } from "@tsonic/tsts";

import type { TargetTypeRef } from "../types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../types/generic-constraints.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

export interface CsharpTypeParameterSourceEvidence {
  readonly sourceFile: SourceFile;
  readonly sourceType: Type;
}

export type CsharpTypeParameterEnvironment = (
  parameter: TypeParameter,
  source?: CsharpTypeParameterSourceEvidence,
) => CsharpTypeParameterConstraintResolution;
