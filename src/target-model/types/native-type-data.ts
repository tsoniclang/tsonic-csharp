import type { Node, SourcePrimitiveKind } from "@tsonic/tsts";

export type TargetTypeRef =
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind }
  | { readonly kind: "target-named"; readonly id: string; readonly typeArguments?: readonly TargetTypeRef[];
      readonly csharpAllowsRefLikeTypeArguments: readonly boolean[];
      readonly csharpRuntimeUnionSemantics?: "native-ordered" }
  | { readonly kind: "type-parameter"; readonly identity: string; readonly name: string;
      readonly csharpDeclaration?: Node;
      readonly csharpRequirementDependencies?: readonly TargetTypeRef[];
      readonly csharpConstraints?: CsharpTypeParameterConstraintResolution;
      readonly csharpProjection?: CsharpOptionalTypeProjection }
  | { readonly kind: "array"; readonly element: TargetTypeRef; readonly rank?: number }
  | { readonly kind: "tuple"; readonly elements: readonly TargetTypeRef[] }
  | { readonly kind: "pointer"; readonly pointee: TargetTypeRef; readonly mutability?: "const" | "mut" | "target-defined" }
  | { readonly kind: "function-pointer"; readonly args: readonly TargetTypeRef[]; readonly result: TargetTypeRef; readonly abi?: readonly string[] }
  | { readonly kind: "opaque"; readonly id: string };

export type CsharpTypeParameterConstraint =
  | { readonly kind: "type"; readonly type: TargetTypeRef }
  | {
      readonly kind: "keyword";
      readonly keyword: "class" | "struct" | "notnull" | "unmanaged";
    }
  | { readonly kind: "constructor" };

export type CsharpTypeParameterConstraintResolution =
  | {
      readonly kind: "resolved";
      readonly constraints: readonly CsharpTypeParameterConstraint[];
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

export type CsharpRepresentedTypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpConstraints: {
    readonly kind: "resolved";
    readonly constraints: readonly CsharpTypeParameterConstraint[];
  };
};

export type CsharpExplicitImplementationConstraint = "class" | "default" | undefined;

export interface CsharpOptionalTypeProjection {
  readonly kind: "optional";
  readonly part: "storage" | "operations";
  readonly arguments: readonly [TargetTypeRef];
}

export interface CsharpOptionalStorageLayout {
  readonly payload: TargetTypeRef;
  readonly carrier: TargetTypeRef;
  readonly operations: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export type CsharpOptionalProjectedType = CsharpRepresentedTypeParameter & {
  readonly csharpProjection: CsharpOptionalTypeProjection;
};
