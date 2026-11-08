import type { CsharpTargetReceiverRelation } from "../../identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../types/model.js";
import type { CsharpSelectedTargetCall, CsharpTargetElementInvocation } from "../objects/members.js";
import type { CsharpTargetPropertyInvocation } from "../program/source-profile-invocations.js";
import type { CsharpUnionProperty } from "../objects/union-properties.js";
import type { SourceCallSelection, SourceElementAccessRecord, SourceMemberAccessSelection, SourceTypeFlowRefusal } from "@tsonic/target-api/source";
import type { ExtensionDiagnostic } from "@tsonic/tsts";

export type CsharpTargetCallSelection =
  | {
      readonly kind: "resolved";
      readonly source: SourceCallSelection;
      readonly call: CsharpSelectedTargetCall;
    }
  | {
      readonly kind: "source-owned";
      readonly source: SourceCallSelection;
      readonly reason: string;
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
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
    }
  | {
      /** A Host refusal (a source binder's constraint) that decided the call; readers forward it unchanged (R5, I7). */
      readonly kind: "refused";
      readonly refusal: SourceTypeFlowRefusal;
    };

export type CsharpTargetElementSelection =
  | {
      readonly kind: "resolved";
      readonly source: SourceElementAccessRecord;
      readonly targetMember: CsharpTargetMember;
      readonly targetParameterIndex: number;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetElementInvocation;
      readonly origin: "provider" | "source-profile";
      readonly indexConversion?: {
        readonly source: TargetTypeRef;
        readonly target: TargetTypeRef;
        readonly selection: import("../../conversions/selection.js").CsharpConversionSelection;
      };
    }
  | {
      readonly kind: "project-indexer";
      readonly source: SourceElementAccessRecord;
      readonly keyType: TargetTypeRef;
      readonly valueType: TargetTypeRef;
      readonly selectedReadType?: TargetTypeRef;
    }
  | {
      readonly kind: "source-owned";
      readonly source: SourceElementAccessRecord;
      readonly reason: string;
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
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
      readonly source: SourceMemberAccessSelection;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly origin: "provider" | "source-profile";
      readonly invocation: CsharpTargetPropertyInvocation;
    }
  | {
      readonly kind: "source-owned";
      readonly source: SourceMemberAccessSelection;
      readonly reason: string;
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
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

