import type { CsharpConversionSelection } from "../conversions/selection.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpProjectTypeIssue } from "./project-types.js";
import type { CsharpSourceCallableContract } from "./source-callable-contract.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpProjectCallableAdapter {
  readonly contract: CsharpSourceCallableContract;
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
  readonly interfaceType?: TargetTypeRef;
}

export interface CsharpProjectCallableDispatch {
  readonly overridesBase: boolean;
  readonly hasDerivedOverride: boolean;
  readonly implementation: CsharpSourceCallableContract;
  readonly adapters: readonly CsharpProjectCallableAdapter[];
}

export interface CsharpProjectCallableAdapters {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly callableDispatch: { readonly get: (declaration: Node) => CsharpProjectCallableDispatch | undefined };
}

export type CsharpCallableParameterAdapter =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "omitted"; readonly parameterIndex: number }
  | { readonly kind: "rest-element"; readonly parameterIndex: number; readonly offset: number;
      readonly optional: boolean; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "rest"; readonly target: TargetTypeRef; readonly segments: readonly CsharpCallableRestSegment[] };

export interface CsharpCallableValueAdapter {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpCallableRestSegment =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "sequence"; readonly parameterIndex: number; readonly offset: number; readonly adapter: CsharpCallableValueAdapter };
