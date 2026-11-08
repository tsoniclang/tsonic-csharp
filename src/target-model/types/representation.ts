import type { Node } from "@tsonic/tsts";
import type {
  SourceApplicationIdentity,
  SourceCategory,
  SourceCategoryDomain,
  SourceDescriptorView,
  SourceMemberOrigin,
  SourceRefusal,
  SourceSumApplication,
  SourceTypeDescriptorSignature,
  SourceTypeEvidence,
  SourceTypeParameter,
} from "@tsonic/target-api/source";
import type { TargetTypeRef, CsharpRepresentedTypeParameter, CsharpOptionalStorageLayout } from "./native-type-data.js";
import type { CsharpNativeMethodTypeParameter } from "./native-type-data.js";

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

export interface CsharpSourceSumPhysicalSlot {
  readonly carrier: TargetTypeRef;
  readonly category: SourceCategoryDomain;
}

export interface CsharpSourceRoleImplementation {
  readonly storage: TargetTypeRef;
  readonly value: TargetTypeRef;
  readonly storageSlots: readonly CsharpSourceSumPhysicalSlot[];
  readonly valueSlots: readonly CsharpSourceSumPhysicalSlot[];
  readonly valueToStorage: readonly CsharpSourceSumArmStorage[];
  readonly storageOptional: CsharpOptionalStorageLayout | undefined;
  readonly valueOptional: CsharpOptionalStorageLayout | undefined;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
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
      readonly roles: readonly CsharpSourceRoleWitness[];
    }
);

export interface CsharpRepresentedSignature {
  readonly source: SourceTypeDescriptorSignature;
  readonly typeParameters: readonly CsharpRepresentedTypeParameter[];
  readonly receiver: CsharpRepresentedType | undefined;
  readonly parameters: readonly CsharpRepresentedType[];
  readonly result: CsharpRepresentedType;
}

export interface CsharpDeclaredRepresentation {
  readonly carrier: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

interface CsharpSourceCategoryWitnessBase {
  readonly evidence: SourceTypeEvidence;
  readonly valueType: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export type CsharpSourceCategoryWitness = CsharpSourceCategoryWitnessBase & (
  | { readonly kind: "known"; readonly category: SourceCategory }
  | { readonly kind: "witness"; readonly witnessType: TargetTypeRef }
);

export interface CsharpSourceCollectionKey {
  readonly type: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export interface CsharpRepresentationView {
  readonly source: SourceDescriptorView;
  collectionKey(
    evidence: SourceTypeEvidence,
    physicalCarrier: TargetTypeRef,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpSourceCollectionKey>;
  applyRequirements(
    parameters: readonly CsharpNativeMethodTypeParameter[],
    application: SourceApplicationIdentity,
    site: Node,
  ): CsharpRepresentationOutcome<readonly TargetTypeRef[]>;
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
    physicalCarrier: TargetTypeRef,
    site: Node,
  ): CsharpRepresentationOutcome<CsharpSourceCategoryWitness>;
}
