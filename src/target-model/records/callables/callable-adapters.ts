import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "./callable-inputs.js";
import type { CsharpProjectTypeIssue } from "../types/project-types.js";
import type { SourceCallableSourceContract } from "./source-callable-contract.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpProjectCallableAdapter {
  readonly contract: SourceCallableSourceContract;
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
}

export interface CsharpProjectMethodDispatch {
  readonly kind: "method";
  readonly overridesBase: boolean;
  readonly hasDerivedOverride: boolean;
  readonly implementation: SourceCallableSourceContract;
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
