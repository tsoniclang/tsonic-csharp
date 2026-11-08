import type { Node } from "@tsonic/tsts";
import type {
  SourceCategory,
  SourceCategoryDomain,
  SourceDescriptorView,
  SourceMemberOrigin,
  SourceRefusal,
  SourceSumApplication,
  SourceTypeEvidence,
  SourceTypeParameter,
} from "@tsonic/target-api/source";
import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeParameterConstraint } from "./generic-constraints.js";

export interface CsharpNativeRepresentationRefusal {
  readonly kind: "native-refused";
  readonly source: "tsonic-csharp";
  readonly code: `CSHARP_${string}`;
  readonly message: string;
  readonly site: Node;
}

export type CsharpRepresentationOutcome<Value> =
  | { readonly kind: "represented"; readonly value: Value }
  | { readonly kind: "source-refused"; readonly refusal: SourceRefusal }
  | CsharpNativeRepresentationRefusal;

export type CsharpRepresentationPosition =
  | "storage"
  | "value"
  | "type-argument"
  | "return";

export type CsharpRepresentedTypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpConstraints: {
    readonly kind: "resolved";
    readonly constraints: readonly CsharpTypeParameterConstraint[];
  };
};

export interface CsharpSourceSumPhysicalSlot {
  readonly carrier: TargetTypeRef;
  readonly category: SourceCategoryDomain;
}

export type CsharpSourceSumArmStorage =
  | { readonly kind: "absence" }
  | { readonly kind: "slot"; readonly index: number };

export interface CsharpSourceRoleWitness {
  readonly source: SourceSumApplication["roles"][number];
  readonly valueType: TargetTypeRef;
  readonly witnessType: TargetTypeRef;
}

interface CsharpRepresentedTypeBase {
  readonly evidence: SourceTypeEvidence;
  readonly carrier: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export type CsharpRepresentedType = CsharpRepresentedTypeBase & (
  | { readonly kind: "direct" }
  | {
      readonly kind: "closed-source-sum";
      readonly application: SourceSumApplication;
      readonly slots: readonly CsharpSourceSumPhysicalSlot[];
      readonly armStorage: readonly CsharpSourceSumArmStorage[];
      readonly roles: readonly CsharpSourceRoleWitness[];
    }
  | {
      readonly kind: "open-source-sum";
      readonly application: SourceSumApplication;
      readonly carrier: CsharpRepresentedTypeParameter;
      readonly roles: readonly CsharpSourceRoleWitness[];
    }
);

interface CsharpSourceCategoryWitnessBase {
  readonly evidence: SourceTypeEvidence;
  readonly valueType: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export type CsharpSourceCategoryWitness = CsharpSourceCategoryWitnessBase & (
  | { readonly kind: "known"; readonly category: SourceCategory }
  | { readonly kind: "witness"; readonly witnessType: TargetTypeRef }
);

export interface CsharpRepresentationView {
  readonly source: SourceDescriptorView;
  represent(
    evidence: SourceTypeEvidence,
    position: CsharpRepresentationPosition,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpRepresentedType>;
  parameter(
    parameter: SourceTypeParameter,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpRepresentedTypeParameter>;
  member(
    owner: SourceTypeEvidence,
    origin: SourceMemberOrigin,
    position: CsharpRepresentationPosition,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpRepresentedType>;
  category(
    evidence: SourceTypeEvidence,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpSourceCategoryWitness>;
}
