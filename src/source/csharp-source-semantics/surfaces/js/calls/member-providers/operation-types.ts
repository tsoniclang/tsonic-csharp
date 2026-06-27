import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  ObjectRecordDictionaryOperation,
} from "../../objects.js";
import type {
  JsSurfaceSelectedSourceIdentity,
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";

export interface JsSurfaceOperationRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly policyKind: JsSurfaceOperationPolicyKind;
  readonly targetProviders?: readonly JsSurfaceOperationTargetProvider[];
  readonly semanticException?: JsSurfaceOperationSemanticException;
  readonly unsupported?: JsSurfaceUnsupportedOperation;
  readonly callableWithoutContext?: boolean;
  readonly capabilityId?: string;
  readonly requiredFacts?: readonly string[];
}

export type JsSurfaceOperationPolicyKind =
  | "provider-member"
  | "carrier-member"
  | "runtime-helper"
  | "semantic-exception"
  | "unsupported";

export type JsSurfaceOperationTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "selected-metadata";
    readonly metadata: JsSurfaceSelectedMetadataSelection;
  }
  | {
    readonly kind: "runtime-helper";
    readonly helper: JsSurfaceRuntimeHelperSelection;
  }
  | {
    readonly kind: "semantic-exception";
    readonly exception: JsSurfaceSemanticExceptionSelection;
  };

export type JsSurfaceSelectedMetadataSelection =
  | {
    readonly kind: "closed-sequence";
    readonly requireResultElementType: boolean;
  }
  | {
    readonly kind: "closed-keyed-collection";
    readonly useResultCarrier: boolean;
  };

export type JsSurfaceRuntimeHelperSelection =
  | {
    readonly kind: "record-dictionary";
    readonly operation: ObjectRecordDictionaryOperation;
  }
  | {
    readonly kind: "record-dictionary-json-stringify";
  };

export type JsSurfaceSemanticExceptionSelection =
  | {
    readonly kind: "date-call-construct";
  }
  | {
    readonly kind: "object-primitive-receiver-to-string";
  };

export interface JsSurfaceOperationSemanticException {
  readonly reason: string;
  readonly requiredFacts: readonly string[];
  readonly capabilityId?: string;
}

export interface JsSurfaceUnsupportedOperation {
  readonly reason: string;
  readonly requiredFacts: readonly string[];
  readonly capabilityId: string;
}

export interface JsSurfaceCallTargetProviderRequest {
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly request: CheckedCallMappingRequest;
  readonly context: ExtensionObservationContext<"operation.mapCheckedCall">;
  readonly host: CsharpJsSurfaceHost;
}

export interface JsSurfaceCallCallableProviderRequest {
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
}

export function jsSurfaceTargetMemberIsCallable(member: TargetMember): boolean {
  return member.kind !== "property";
}
