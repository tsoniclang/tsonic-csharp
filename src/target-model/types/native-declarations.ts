import type { ArgumentPassingMode } from "@tsonic/tsts";
import type { CsharpTargetMember, CsharpTargetNamedTypeRef, TargetBindingFact } from "./model.js";
import type { CsharpNativeCallableMember } from "./native-type-data.js";
import type { CsharpRepresentedTypeParameter, TargetTypeRef } from "./native-type-data.js";

export interface CsharpNativeSlotAccess {
  readonly member: CsharpTargetMember;
  readonly type: TargetTypeRef;
  readonly passingMode: ArgumentPassingMode;
}

export type CsharpNativeDeclarationMember =
  | {
      readonly kind: "slot";
      readonly member: CsharpTargetMember;
      readonly storage: { readonly type: TargetTypeRef; readonly readonly: boolean } | undefined;
      readonly read: CsharpNativeSlotAccess | undefined;
      readonly write: CsharpNativeSlotAccess | undefined;
    }
  | {
      readonly kind: "callable";
      readonly member: CsharpTargetMember;
      readonly method: CsharpNativeCallableMember;
      readonly value: CsharpNativeCallableMember | undefined;
    }
  | { readonly kind: "event"; readonly member: CsharpTargetMember };

export interface CsharpNativeDeclaration {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly kind: TargetBindingFact["kind"];
  readonly parameters: readonly CsharpRepresentedTypeParameter[];
  readonly supertypes: readonly TargetTypeRef[];
  readonly members: readonly CsharpNativeDeclarationMember[];
}

export interface CsharpNativeDeclarationApplication {
  readonly definition: CsharpNativeDeclaration;
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly supertypes: readonly TargetTypeRef[];
  readonly members: readonly CsharpNativeDeclarationMember[];
}

export interface CsharpNativeDeclarationQueries {
  nativeDeclaration(carrier: TargetTypeRef): CsharpNativeDeclarationApplication | undefined;
}
