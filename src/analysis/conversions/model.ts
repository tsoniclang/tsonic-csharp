import type { Node } from "@tsonic/tsts";
import type { SourceProjectReference } from "@tsonic/target-api/source";
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
  CsharpStorageRepresentationClassifications,
} from "../storage/index.js";

export interface CsharpConversionIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpConversionClassifications {
  readonly issues: readonly CsharpConversionIssue[];
  directCallableReference(expression: Node): SourceProjectReference | undefined;
  matchesUnionProjection(
    source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
    selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
  ): boolean;
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
    readonly storage: CsharpStorageRepresentationClassifications;
  }): CsharpConversionClassifications;
}
