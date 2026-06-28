import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import type {
  NodejsClassCallTargetMember,
  NodejsClassPropertyTargetMember,
  NodejsModuleCallTargetMember,
  NodejsModulePropertyTargetMember,
} from "./types.js";

export interface NodejsModuleCallTargetMetadata extends NodejsModuleCallTargetMember {
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

export interface NodejsModulePropertyTargetMetadata extends NodejsModulePropertyTargetMember {
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerType: ProviderTypeExpression;
}

export interface NodejsClassCallTargetMetadata extends NodejsClassCallTargetMember {
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly memberKind: "constructor" | "method";
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType?: ProviderTypeExpression;
  readonly static?: boolean;
}

export interface NodejsClassPropertyTargetMetadata extends NodejsClassPropertyTargetMember {
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly memberKind: "property" | "indexer";
  readonly providerType: ProviderTypeExpression;
  readonly readonly?: true;
}

export interface NodejsModuleCallTargetMetadataRow {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly targetParameters: readonly TargetParameter[];
  readonly targetReturnType: TargetTypeRef;
  readonly declaringType: TargetTypeRef;
}

export interface NodejsModulePropertyTargetMetadataRow {
  readonly exportName: string;
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly providerType: ProviderTypeExpression;
  readonly targetReturnType: TargetTypeRef;
  readonly declaringType: TargetTypeRef;
}

export interface NodejsClassCallTargetMetadataRow {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly memberKind: "constructor" | "method";
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType?: ProviderTypeExpression;
  readonly targetParameters: readonly TargetParameter[];
  readonly targetReturnType: TargetTypeRef;
  readonly declaringType: TargetTypeRef;
  readonly static?: boolean;
}

export interface NodejsClassPropertyTargetMetadataRow {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly memberKind: "property" | "indexer";
  readonly providerType: ProviderTypeExpression;
  readonly targetParameters: readonly TargetParameter[];
  readonly targetReturnType: TargetTypeRef;
  readonly declaringType: TargetTypeRef;
  readonly readonly?: true;
}

export function nodejsModuleCallTargetMetadata(
  row: NodejsModuleCallTargetMetadataRow,
): NodejsModuleCallTargetMetadata {
  return {
    exportName: row.exportName,
    signatureId: row.signatureId,
    targetMemberId: row.targetMemberId,
    targetName: row.targetName,
    providerParameters: row.providerParameters,
    providerReturnType: row.providerReturnType,
    member: nodejsTargetMember({
      targetMemberId: row.targetMemberId,
      sourceName: row.sourceName,
      targetName: row.targetName,
      kind: "method",
      targetParameters: row.targetParameters,
      targetReturnType: row.targetReturnType,
      declaringType: row.declaringType,
      static: true,
    }),
  };
}

export function nodejsModulePropertyTargetMetadata(
  row: NodejsModulePropertyTargetMetadataRow,
): NodejsModulePropertyTargetMetadata {
  return {
    exportName: row.exportName,
    targetMemberId: row.targetMemberId,
    targetName: row.targetName,
    providerType: row.providerType,
    member: nodejsTargetMember({
      targetMemberId: row.targetMemberId,
      sourceName: row.sourceName,
      targetName: row.targetName,
      kind: "property",
      targetParameters: [],
      targetReturnType: row.targetReturnType,
      declaringType: row.declaringType,
      static: true,
    }),
  };
}

export function nodejsClassCallTargetMetadata(
  row: NodejsClassCallTargetMetadataRow,
): NodejsClassCallTargetMetadata {
  return {
    exportName: row.exportName,
    memberName: row.memberName,
    memberId: row.memberId,
    signatureId: row.signatureId,
    targetMemberId: row.targetMemberId,
    targetName: row.targetName,
    memberKind: row.memberKind,
    providerParameters: row.providerParameters,
    ...(row.providerReturnType !== undefined ? { providerReturnType: row.providerReturnType } : {}),
    ...(row.static === true ? { static: true } : {}),
    member: nodejsTargetMember({
      targetMemberId: row.targetMemberId,
      sourceName: row.sourceName,
      targetName: row.targetName,
      kind: row.memberKind,
      targetParameters: row.targetParameters,
      targetReturnType: row.targetReturnType,
      declaringType: row.declaringType,
      ...(row.static === true ? { static: true } : {}),
    }),
  };
}

export function nodejsClassPropertyTargetMetadata(
  row: NodejsClassPropertyTargetMetadataRow,
): NodejsClassPropertyTargetMetadata {
  return {
    exportName: row.exportName,
    memberName: row.memberName,
    memberId: row.memberId,
    targetMemberId: row.targetMemberId,
    targetName: row.targetName,
    memberKind: row.memberKind,
    providerType: row.providerType,
    ...(row.readonly === true ? { readonly: true } : {}),
    member: nodejsTargetMember({
      targetMemberId: row.targetMemberId,
      sourceName: row.sourceName,
      targetName: row.targetName,
      kind: row.memberKind,
      targetParameters: row.targetParameters,
      targetReturnType: row.targetReturnType,
      declaringType: row.declaringType,
      ...(row.readonly === true ? { readonly: true } : {}),
    }),
  };
}

function nodejsTargetMember(row: {
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly kind: CsharpTargetMember["kind"];
  readonly targetParameters: readonly TargetParameter[];
  readonly targetReturnType: TargetTypeRef;
  readonly declaringType: TargetTypeRef;
  readonly static?: true;
  readonly readonly?: true;
}): CsharpTargetMember {
  return {
    id: row.targetMemberId,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: row.kind,
    parameters: row.targetParameters,
    returnType: row.targetReturnType,
    declaringType: row.declaringType,
    ...(row.static === true ? { static: true } : {}),
    ...(row.readonly === true ? { readonly: true } : {}),
  };
}
