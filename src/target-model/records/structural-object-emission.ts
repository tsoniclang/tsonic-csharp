import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpTypeParameterConstraint } from "../types/generic-constraints.js";

export interface CsharpStructuralMethodEmission {
  readonly name: string;
  readonly returnType: TargetTypeRef;
  readonly parameters: readonly { readonly type: TargetTypeRef; readonly rest: boolean; readonly optional: boolean }[];
  readonly typeParameters: readonly {
    readonly declaration: Node;
    readonly identity: string;
    readonly name: string;
    readonly constraints: readonly CsharpTypeParameterConstraint[];
  }[];
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
}

export interface CsharpStructuralObjectEmission {
  readonly members: readonly CsharpStructuralInterfaceMemberEmission[];
  readonly methodValues: readonly CsharpStructuralPropertyEmission[];
  readonly methods: ReadonlyMap<CsharpObjectShapeMemberFact, CsharpStructuralMethodEmission>;
  readonly contracts: readonly CsharpMethodValueContractEmission[];
}

export interface CsharpStructuralObjectEmissionRecords {
  readonly structuralObject: { readonly get: (shape: CsharpObjectShapeFact) => CsharpStructuralObjectEmission | undefined };
}
