import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/conversions.js";

import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";

export interface CsharpSealedConversionClassifications extends CsharpConversionClassifications {
  readonly exactLiteralRequests: readonly CsharpExactLiteralRequest[];
}

export interface CsharpConversionAnalysis {
  readonly classifications: CsharpConversionClassifications;
  seal(input: {
    readonly operations: CsharpTargetOperationClassifications;
    readonly expectedTypes: CsharpExpectedTypeClassifications;
    readonly valueReads: CsharpValueReadClassifications;
  }): CsharpSealedConversionClassifications;
}
