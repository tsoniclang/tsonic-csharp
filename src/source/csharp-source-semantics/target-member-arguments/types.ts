import type {
  ExtensionFactSubject,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolver,
} from "../target-type-ref-resolution.js";

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly ExtensionFactSubject[];
  readonly receiver?: ExtensionFactSubject;
  readonly sourceSelectedSignature?: unknown;
}

export interface TargetMemberSelectionOptions {
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly declaringTargetType?: TargetTypeRef;
  readonly declaringTypeParameters?: readonly TargetTypeParameter[];
  readonly firstArgumentReceiver?: ExtensionFactSubject | false;
}

export type {
  TargetTypeRefResolver,
};
