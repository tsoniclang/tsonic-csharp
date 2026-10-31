import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";

import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/types/expected-types.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpRequiredRecord } from "../program/records/objects/required-records.js";

export interface CsharpPreparedConversionClassifications extends CsharpConversionClassifications {
  readonly exactLiteralRequests: readonly CsharpExactLiteralRequest[];
}

export interface CsharpConversionAnalysis {
  readonly classifications: CsharpConversionClassifications;
  prepare(input: {
    readonly expectedTypes: CsharpExpectedTypeClassifications;
    readonly valueReads: CsharpValueReadClassifications;
  }): CsharpPreparedConversionClassifications;
  close(nativeDemand: CsharpNativeDemandAnalysis, requiredRecords: CsharpRequiredRecord[],
    captures: import("../../target-model/records/callables/capture-storage.js").CsharpCaptureStorage,
    creations: import("../../target-model/records/callables/callable-values.js").CsharpCallableCreationIndex): void;
  seal(): CsharpConversionClassifications;
}
