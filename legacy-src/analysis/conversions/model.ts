import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/conversions.js";

import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpRequiredRecord } from "../program/records/required-records.js";

export interface CsharpPreparedConversionClassifications extends CsharpConversionClassifications {
  readonly exactLiteralRequests: readonly CsharpExactLiteralRequest[];
}

export interface CsharpConversionAnalysis {
  readonly classifications: CsharpConversionClassifications;
  prepare(input: {
    readonly operations: CsharpTargetOperationClassifications;
    readonly expectedTypes: CsharpExpectedTypeClassifications;
    readonly valueReads: CsharpValueReadClassifications;
  }): CsharpPreparedConversionClassifications;
  close(nativeDemand: CsharpNativeDemandAnalysis, requiredRecords: CsharpRequiredRecord[],
    captures: import("../../target-model/records/capture-storage.js").CsharpCaptureStorage): void;
  seal(): CsharpConversionClassifications;
}
