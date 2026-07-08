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

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly ExtensionFactSubject[];
  readonly receiver?: ExtensionFactSubject;
  readonly sourceSelectedSignature?: unknown;
  readonly sourceSelectedIdentity?: string;
  readonly selectedProviderDeclaration?: ProviderDeclarationIdentity;
}

export interface TargetMemberSelectionOptions {
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly declaringTargetType?: TargetTypeRef;
  readonly declaringTypeParameters?: readonly CsharpTargetTypeParameter[];
  readonly methodTargetTypeArguments?: readonly TargetTypeRef[];
  readonly firstArgumentReceiver?: ExtensionFactSubject | false;
  readonly preferredMemberId?: string;
}

export type {
  TargetTypeRefResolver,
};
