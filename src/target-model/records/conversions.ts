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

/**
 * Type stages of one source value at one node, each read once from its producing owner by
 * analysis/conversions/value-read-stages.ts. A missing stage means the owner produced none for the node.
 * The selections name the question a consumer asks; each keeps the stage order that question needs.
 */
export interface CsharpValueReadStages {
  /** Checked source type of the node. */
  readonly source?: TargetTypeRef;
  /** Declared storage target of the node. */
  readonly declaredStorage?: TargetTypeRef;
  /** Storage target read by a reference. */
  readonly readStorage?: TargetTypeRef;
  /** Result of the selected target operation. */
  readonly selectedOperation?: TargetTypeRef;
  /** Checked flow-narrowed read. */
  readonly narrowedRead?: TargetTypeRef;
  /** Read type of the selected source-owned member. */
  readonly selectedMemberRead?: TargetTypeRef;
  /** Storage of the selected source-owned member: its runtime-union result, else its raw read type. */
  readonly selectedMemberStorage?: TargetTypeRef;
  /** Value observed by an inferred return: selected operation, else read storage, else source. */
  readonly returnedValue?: TargetTypeRef;
  /** Contextual target of an array literal: selected operation, else declared storage, else source. */
  readonly literalTarget?: TargetTypeRef;
  /** Value produced at the node: selected operation, else source. */
  readonly operationValue?: TargetTypeRef;
  /** Value asserted non-null: selected operation, else narrowed read, else source. */
  readonly assertedValue?: TargetTypeRef;
}

/** Stages known before storage representation, read by declaration and expected-type analysis. */
export interface CsharpValueReadStageIndex {
  readonly get: (node: Node) => CsharpValueReadStages | undefined;
}

/** The sealed stages of one node: the pre-storage stages plus the selected storage representation. */
export interface CsharpValueRead extends CsharpValueReadStages {
  /** Selected storage representation. */
  readonly storage?: TargetTypeRef;
  /** Stored value: storage, else source. */
  readonly storedValue?: TargetTypeRef;
  /** Value at a use before contextual conversion: narrowed read, else selected operation, else storage, else source. */
  readonly value?: TargetTypeRef;
  /** Storage read at a reference: storage, else read storage. */
  readonly readStorageValue?: TargetTypeRef;
  /** Selected flow-read type: selected member read, else value. */
  readonly flowReadValue?: TargetTypeRef;
  /** Storage of a flow read: selected member storage, else storage read at the reference. */
  readonly flowReadStorage?: TargetTypeRef;
}

export interface CsharpValueReadClassifications {
  readonly valueRead: { readonly get: (node: Node) => CsharpValueRead | undefined };
}
