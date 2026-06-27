import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTypeofRuntimeKind,
} from "../../csharp-facts.js";

export type CsharpTargetTypeRenderShape =
  | { readonly kind: "predefined"; readonly name: string }
  | { readonly kind: "named"; readonly namespace?: readonly string[]; readonly name: string }
  | { readonly kind: "nullable" };

export type CsharpTargetNamedTypeRef = Extract<TargetTypeRef, { readonly kind: "target-named" }> & {
  readonly csharpRender?: CsharpTargetTypeRenderShape;
  readonly csharpThrowable?: true;
  readonly csharpTypeofRuntimeKind?: CsharpTypeofRuntimeKind;
  readonly csharpSpecialType?: "string" | "void" | "nullable";
  readonly csharpSourceDeclarationKind?: "class" | "interface" | "enum" | "struct";
  readonly csharpValueType?: true;
  readonly csharpArrayLiteralElementType?: TargetTypeRef;
  readonly csharpEnumerableElementType?: TargetTypeRef;
  readonly csharpReadOnlyIndexableElementType?: TargetTypeRef;
  readonly csharpDenseMutableElementType?: TargetTypeRef;
};

export type CsharpNullableReferenceTargetTypeRef = TargetTypeRef & {
  readonly csharpNullableReference?: true;
};

export type CsharpTargetBindingFact = TargetBindingFact & {
  readonly csharpType?: TargetTypeRef;
  readonly csharpBaseType?: TargetTypeRef;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
};

export interface CsharpDelegateSignatureShape {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType?: TargetTypeRef;
}

export type CsharpDelegateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpDelegateSignature: CsharpDelegateSignatureShape;
};

export type CsharpTaskTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpTaskResultType: TargetTypeRef;
};

export type CsharpRuntimeUnionTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpRuntimeUnionArms: readonly TargetTypeRef[];
};
