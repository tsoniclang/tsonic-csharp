import type { CsharpTargetReceiverRelation } from "../identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../types/model.js";
import type { CsharpSelectedTargetCall, CsharpTargetElementInvocation, ResolvedSourceCallInfo } from "./members.js";
import type { CsharpTargetPropertyInvocation } from "./source-profile-invocations.js";
import type { CsharpUnionProperty } from "./union-properties.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ExtensionDiagnostic } from "@tsonic/tsts";

export type CsharpTargetCallSelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceCallInfo;
      readonly call: CsharpSelectedTargetCall;
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourceCallInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpTargetElementSelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly targetMember: CsharpTargetMember;
      readonly targetParameterIndex: number;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetElementInvocation;
      readonly origin: "provider" | "source-profile";
    }
  | {
      readonly kind: "project-indexer";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly keyType: TargetTypeRef;
      readonly valueType: TargetTypeRef;
      readonly selectedReadType?: TargetTypeRef;
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpTargetPropertySelection =
  | CsharpUnionProperty
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourcePropertyAccessInfo;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly origin: "provider" | "source-profile";
      readonly invocation: CsharpTargetPropertyInvocation;
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourcePropertyAccessInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

export type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
