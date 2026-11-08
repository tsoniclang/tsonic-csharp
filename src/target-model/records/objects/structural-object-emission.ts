import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpNativeCallableMember, CsharpNativeMethodTypeParameter } from "../../types/model.js";
import type { CsharpObjectMethodSignature } from "./object-members.js";

export interface CsharpStructuralMethodEmission extends Omit<CsharpObjectMethodSignature, "returnsVoid"> {
  readonly name: string;
  readonly typeParameters: readonly CsharpNativeMethodTypeParameter[];
}

export interface CsharpStructuralPropertyEmission {
  readonly name: string;
  readonly type: TargetTypeRef;
  readonly writable: boolean;
}

export type CsharpStructuralInterfaceMemberEmission =
  | { readonly kind: "method"; readonly method: CsharpStructuralMethodEmission }
  | { readonly kind: "property"; readonly property: CsharpStructuralPropertyEmission };

export interface CsharpMethodValueContractEmission {
  readonly name: string;
  readonly interface: TargetTypeRef;
  readonly type: TargetTypeRef;
  readonly source: string;
  readonly writable: boolean;
}

export interface CsharpStructuralObjectEmission {
  readonly members: readonly CsharpStructuralInterfaceMemberEmission[];
  readonly methodValues: readonly CsharpStructuralPropertyEmission[];
  readonly methods: ReadonlyMap<CsharpNativeCallableMember, CsharpStructuralMethodEmission>;
  readonly contracts: readonly CsharpMethodValueContractEmission[];
}

export interface CsharpStructuralObjectEmissionRecords {
  readonly structuralObject: { readonly get: (shape: CsharpObjectShapeFact) => CsharpStructuralObjectEmission | undefined };
}
