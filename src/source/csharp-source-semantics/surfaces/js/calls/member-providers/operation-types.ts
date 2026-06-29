import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../../target-types.js";
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
  readonly closedFacts?: JsSurfaceClosedFactsRequirement;
  readonly targetProviders?: readonly JsSurfaceOperationTargetProvider[];
  readonly lifecycleRuntimeCarrierFacts?: readonly JsSurfaceLifecycleRuntimeCarrierFact[];
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

export type JsSurfaceLifecycleRuntimeCarrierFact =
  | {
    readonly subject: "call-result";
    readonly carrier: "array" | "collection";
  }
  | {
    readonly subject: "callee-receiver";
    readonly carrier: "collection";
    readonly checkedTypeDerivation?: "finalization";
  };

export type JsSurfaceClosedFactsRequirement =
  | { readonly kind: "all"; readonly requirements: readonly JsSurfaceClosedFactsRequirement[] }
  | { readonly kind: "receiver"; readonly target: JsSurfaceReceiverTargetCondition }
  | { readonly kind: "arguments"; readonly conditions: readonly JsSurfaceArgumentCondition[] }
  | { readonly kind: "known-argument-targets" };

export type JsSurfaceReceiverTargetCondition =
  JsSurfaceTargetFeatureCondition;

export type JsSurfaceArgumentCondition =
  | { readonly index: number; readonly target: JsSurfaceArgumentTargetCondition }
  | { readonly fromIndex: number; readonly target: JsSurfaceArgumentTargetCondition };

export type JsSurfaceArgumentTargetCondition =
  JsSurfaceTargetFeatureCondition;

export interface JsSurfaceTargetFeatureCondition {
  readonly feature: JsSurfaceTargetFeature;
}

export type JsSurfaceTargetFeature =
  | "array-like"
  | "string"
  | "number"
  | "boolean"
  | "regexp"
  | "date"
  | "js-object"
  | "selected-collection-carrier"
  | "json-value"
  | "object-helper";

export const jsSurfaceTargetFeatures = {
  arrayLike: { feature: "array-like" },
  string: { feature: "string" },
  number: { feature: "number" },
  boolean: { feature: "boolean" },
  regexp: { feature: "regexp" },
  date: { feature: "date" },
  jsObject: { feature: "js-object" },
  selectedCollectionCarrier: { feature: "selected-collection-carrier" },
  jsonValue: { feature: "json-value" },
  objectHelper: { feature: "object-helper" },
} as const satisfies Record<string, JsSurfaceTargetFeatureCondition>;

export type JsSurfaceOperationTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly CsharpTargetMember[]>;
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
    readonly kind: "record-dictionary-has-own";
  }
  | {
    readonly kind: "record-dictionary-assign";
  }
  | {
    readonly kind: "record-dictionary-json-stringify";
  };

export type JsSurfaceSemanticExceptionSelection =
  | {
    readonly kind: "date-call-construct";
  }
  | {
    readonly kind: "boolean-call-construct";
  }
  | {
    readonly kind: "number-call-construct";
  }
  | {
    readonly kind: "string-call-construct";
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
  readonly contextualDeclaringType?: TargetTypeRef;
  readonly contextualResultType?: TargetTypeRef;
}

export function jsSurfaceTargetMemberIsCallable(member: CsharpTargetMember): boolean {
  return member.kind !== "property";
}
