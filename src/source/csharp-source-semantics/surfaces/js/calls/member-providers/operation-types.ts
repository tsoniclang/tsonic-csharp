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
  JsSurfaceSelectedSourceIdentity,
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";

export interface JsSurfaceOperationRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly policyKind: JsSurfaceOperationPolicyKind;
  readonly targetProviders?: readonly JsSurfaceOperationTargetProvider[];
  readonly semanticException?: JsSurfaceOperationSemanticException;
  readonly callableWithoutContext?: boolean;
}

export type JsSurfaceOperationPolicyKind =
  | "provider-member"
  | "carrier-member"
  | "semantic-exception"
  | "unsupported";

export type JsSurfaceOperationTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "contextual-metadata";
    readonly resolver: JsSurfaceOperationTargetProviderResolver;
  }
  | {
    readonly kind: "semantic-exception";
    readonly resolver: JsSurfaceOperationTargetProviderResolver;
  };

export interface JsSurfaceOperationTargetProviderResolver {
  readonly id: string;
  readonly selectTargetMembers: (request: JsSurfaceCallTargetProviderRequest) => readonly TargetMember[];
  readonly hasCallableProvider: (request: JsSurfaceCallCallableProviderRequest) => boolean;
}

export interface JsSurfaceOperationSemanticException {
  readonly reason: string;
  readonly requiredFacts: readonly string[];
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
