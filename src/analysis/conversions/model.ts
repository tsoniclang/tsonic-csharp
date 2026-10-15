import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/conversions.js";

import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";

export interface CsharpConversionAnalysis {
  readonly classifications: CsharpConversionClassifications;
  seal(input: {
    readonly operations: CsharpTargetOperationClassifications;
    readonly expectedTypes: CsharpExpectedTypeClassifications;
    readonly valueReads: CsharpValueReadClassifications;
  }): CsharpConversionClassifications;
}
