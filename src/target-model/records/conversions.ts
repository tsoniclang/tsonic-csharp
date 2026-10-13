import type { CsharpConversionMode, CsharpConversionSelection } from "../conversions/selection.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
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
}

export interface CsharpExpressionConversionClassification {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly selection: CsharpConversionSelection;
  readonly runtimeDemand: boolean;
  readonly identityRequired?: boolean;
  readonly delegateIdentity?: CsharpDelegateAdapterIdentity;
}

export interface CsharpConversionClassifications {
  readonly issues: readonly CsharpConversionIssue[];
  readonly propertyProjection: { readonly get: (expression: Node, source: TargetTypeRef) => readonly CsharpObjectShapeMemberFact[] | undefined };
  readonly delegateAdapters: { readonly get: (scope: Node) => readonly CsharpDelegateAdapterIdentity[] };
  readonly delegateAdapter: { readonly get: (expression: Node, source: TargetTypeRef, target: TargetTypeRef) => CsharpDelegateAdapterIdentity | undefined };
  readonly directCallableReference: { readonly get: (expression: Node) => SourceProjectReference | undefined };
  matchesUnionMapping(
    source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
    selection: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>,
  ): boolean;
  matchesUnionProjection(
    source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
    selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
  ): boolean;
  readonly conversion: { readonly get: (source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) => CsharpConversionSelection | undefined };
  readonly expressionConversion: { readonly get: (expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined, mode: CsharpConversionMode) => CsharpConversionSelection | undefined };
}
