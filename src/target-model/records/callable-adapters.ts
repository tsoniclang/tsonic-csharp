import type { CsharpConversionSelection } from "../conversions/selection.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpProjectTypeIssue } from "./project-types.js";
import type { CsharpSourceCallableSourceContract } from "./source-callable-contract.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpProjectCallableAdapter {
  readonly contract: CsharpSourceCallableSourceContract;
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
}

export interface CsharpProjectMethodDispatch {
  readonly kind: "method";
  readonly overridesBase: boolean;
  readonly hasDerivedOverride: boolean;
  readonly implementation: CsharpSourceCallableSourceContract;
  readonly adapters: readonly CsharpProjectCallableAdapter[];
}

export interface CsharpProjectPropertyDispatch {
  readonly kind: "property";
  readonly parameters: readonly Node[];
  readonly overridesBase: boolean;
  readonly hasDerivedOverride: boolean;
}

export type CsharpProjectCallableDispatch = CsharpProjectMethodDispatch | CsharpProjectPropertyDispatch;

export interface CsharpProjectCallableAdapters {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly callableDispatch: { readonly get: (declaration: Node) => CsharpProjectCallableDispatch | undefined };
}

export type CsharpCallableParameterAdapter =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "omitted"; readonly parameterIndex: number }
  | { readonly kind: "rest-element"; readonly parameterIndex: number; readonly offset: number;
      readonly optional: boolean; readonly lengthMember: string; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "rest"; readonly target: TargetTypeRef; readonly element: TargetTypeRef;
      readonly collection: "array" | "js-array"; readonly segments: readonly CsharpCallableRestSegment[] };

export interface CsharpCallableValueAdapter {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpCallableRestSegment =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "sequence"; readonly parameterIndex: number; readonly offset: number;
      readonly lengthMember: string; readonly adapter: CsharpCallableValueAdapter };
