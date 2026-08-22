import type { Node } from "@tsonic/tsts";
import type {
  CsharpConversionMode,
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpExpectedTypeClassifications,
} from "../expected-types/index.js";
import type {
  CsharpTargetOperationClassifications,
} from "../operations/index.js";
import type {
  CsharpStorageClassifications,
} from "../storage/index.js";

export interface CsharpConversionIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpConversionClassifications {
  readonly issues: readonly CsharpConversionIssue[];
  select(
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
  ): CsharpConversionSelection | undefined;
  selectExpression(
    expression: Node,
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
  ): CsharpConversionSelection | undefined;
}

export interface CsharpConversionAnalysis {
  readonly classifications: CsharpConversionClassifications;
  seal(input: {
    readonly operations: CsharpTargetOperationClassifications;
    readonly expectedTypes: CsharpExpectedTypeClassifications;
    readonly storage: CsharpStorageClassifications;
  }): CsharpConversionClassifications;
}
