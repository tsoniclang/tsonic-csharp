import type { CsharpConversionMode, CsharpConversionSelection } from "../conversions/selection.js";
import type { CsharpGeneratedHelperRecords } from "./generated-helpers.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpClosedShapeMemberProjection } from "./closed-object-shapes.js";
import type { SourceProjectReference } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

export interface CsharpConversionIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpDelegateAdapterIdentity {
  readonly declaration: Node;
  readonly scope: Node;
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>;
  readonly assertPresent: boolean;
}

export interface CsharpExpressionConversionClassification {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly selection: CsharpConversionSelection;
  readonly identityRequired?: boolean;
  readonly delegateIdentity?: CsharpDelegateAdapterIdentity;
}

export interface CsharpConversionClassifications extends CsharpGeneratedHelperRecords {
  readonly propertyProjectionRoots: readonly { readonly node: Node; readonly carrier: TargetTypeRef }[];
  readonly issues: readonly CsharpConversionIssue[];
  readonly propertyProjection: { readonly get: (expression: Node, source: TargetTypeRef) => readonly CsharpClosedShapeMemberProjection[] | undefined };
  readonly delegateAdapters: { readonly get: (scope: Node) => readonly CsharpDelegateAdapterIdentity[] };
  readonly delegateAdapter: { readonly get: (expression: Node, source: TargetTypeRef, target: TargetTypeRef) => CsharpDelegateAdapterIdentity | undefined };
  readonly directCallableReference: { readonly get: (expression: Node) => SourceProjectReference | undefined };
  readonly conversion: { readonly get: (source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) => CsharpConversionSelection | undefined };
  readonly expressionConversion: { readonly get: (expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) => CsharpConversionSelection | undefined };
}

export interface CsharpValueReadStages {
  readonly returnedValue?: TargetTypeRef;
  readonly literalTarget?: TargetTypeRef;
  readonly operationValue?: TargetTypeRef;
}

export interface CsharpValueReadStageIndex {
  readonly get: (node: Node) => CsharpValueReadStages | undefined;
}

export interface CsharpValueRead {
  readonly source?: TargetTypeRef;
  readonly selectedOperation?: TargetTypeRef;
  readonly narrowedRead?: TargetTypeRef;
  readonly storage?: TargetTypeRef;
  readonly assertedValue?: TargetTypeRef;
  readonly storedValue?: TargetTypeRef;
  readonly value?: TargetTypeRef;
  readonly readStorageValue?: TargetTypeRef;
  readonly flowReadValue?: TargetTypeRef;
  readonly flowReadStorage?: TargetTypeRef;
}

export interface CsharpValueReadClassifications {
  readonly valueRead: { readonly get: (node: Node) => CsharpValueRead | undefined };
}
