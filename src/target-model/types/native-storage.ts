import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import type { CsharpRepresentedTypeParameter } from "./generic-constraints.js";

export interface CsharpNativeStorageDefinition {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly parameters: readonly CsharpRepresentedTypeParameter[];
  readonly payload: TargetTypeRef;
  readonly fieldName: string;
  readonly projectionWitness: CsharpTargetNamedTypeRef;
}

export interface CsharpNativeStorageCategory {
  readonly storage: CsharpNativeStorageDefinition;
  readonly parameters: readonly CsharpRepresentedTypeParameter[];
  readonly payloadCategory: TargetTypeRef;
  readonly witness: CsharpTargetNamedTypeRef;
}

export interface CsharpNativeStorageKey {
  readonly storage: CsharpNativeStorageDefinition;
  readonly parameters: readonly CsharpRepresentedTypeParameter[];
  readonly payloadKey: TargetTypeRef;
  readonly witness: CsharpTargetNamedTypeRef;
}

export interface CsharpNativeStorageQueries {
  storage(carrier: TargetTypeRef): CsharpNativeStorageDefinition | undefined;
}
