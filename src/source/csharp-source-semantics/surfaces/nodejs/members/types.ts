import type {
  TargetMember,
} from "@tsonic/tsts";

export interface NodejsModuleCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly member: TargetMember;
}

export interface NodejsModulePropertyTargetMember {
  readonly exportName: string;
  readonly member: TargetMember;
}

export interface NodejsClassCallTargetMember {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly signatureId: string;
  readonly member: TargetMember;
}

export interface NodejsClassPropertyTargetMember {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly member: TargetMember;
}

export interface NodejsUnsupportedTargetIdentity {
  readonly exportName: string;
  readonly memberName?: string;
  readonly signatureId?: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
}
