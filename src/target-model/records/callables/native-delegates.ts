import type { Node } from "@tsonic/tsts";
import type { CsharpDelegateSignatureShape, CsharpTargetNamedTypeRef, CsharpTargetParameter } from "../../types/model.js";
import type { CsharpRepresentedTypeParameter } from "../../types/generic-constraints.js";

export interface CsharpNativeCallableEmissionMember {
  readonly name: string;
  readonly signature: CsharpDelegateSignatureShape;
  readonly receiver: CsharpTargetParameter | undefined;
  readonly parameters: readonly CsharpTargetParameter[];
  readonly typeParameters: readonly CsharpRepresentedTypeParameter[];
}

export interface CsharpNativeDelegateEmission {
  readonly kind: "delegate" | "contract";
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly members: readonly CsharpNativeCallableEmissionMember[];
  readonly typeParameters: readonly CsharpRepresentedTypeParameter[];
  readonly site: Node;
}

export interface CsharpNativeDelegateRecords {
  readonly nativeDelegates: { readonly get: () => readonly CsharpNativeDelegateEmission[] };
}
