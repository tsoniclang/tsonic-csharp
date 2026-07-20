import type {
  ExtensionFactSubject,
  ProviderDeclarationIdentity,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetTypeParameter,
} from "../target-types.js";
import type {
  TargetTypeRefResolver,
} from "../target-type-ref-resolution.js";

/**
 * One source-side value paired with the exact TSTS-selected type for that same
 * value. Subject and selected type travel together so no consumer can index
 * them out of alignment.
 */
export interface TargetMemberSourceValue {
  readonly subject: ExtensionFactSubject;
  readonly selectedType?: ExtensionFactSubject;
}

/**
 * One target parameter slot after receiver passing is applied. A member with
 * `receiverPassing === "first-argument"` contributes a `receiver` slot ahead of
 * its argument slots, so slot ordinals are target ordinals and each slot still
 * carries its own selected type.
 */
export interface TargetMemberEffectiveSlot extends TargetMemberSourceValue {
  readonly origin: "receiver" | "argument";
}

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly TargetMemberSourceValue[];
  readonly receiver?: TargetMemberSourceValue;
  readonly sourceSelectionProven?: true;
  readonly sourceSelectedIdentity?: string;
  readonly selectedProviderDeclaration?: ProviderDeclarationIdentity;
}

export interface TargetMemberSelectionOptions {
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly getAssignableTargetTypeRefs?: (type: TargetTypeRef) => readonly TargetTypeRef[];
  readonly declaringTargetType?: TargetTypeRef;
  readonly declaringTypeParameters?: readonly CsharpTargetTypeParameter[];
  readonly methodTargetTypeArguments?: readonly TargetTypeRef[];
  readonly firstArgumentReceiver?: TargetMemberSourceValue | false;
  readonly preferredMemberId?: string;
}

export type {
  TargetTypeRefResolver,
};
