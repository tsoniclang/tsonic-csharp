import type {
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../js/source-library.js";

export const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const stringTargetType = csharpStringTargetType();
export const boolTargetType = csharpSourcePrimitiveTargetType("bool");
export const nodePathTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.path", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "path"));
export const parsedPathProviderType = { kind: "provider-ref", name: "ParsedPath" } satisfies ProviderTypeExpression;
export const parsedPathTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.ParsedPath", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "ParsedPath"));

export interface NodePathProviderParameter {
  readonly name: string;
  readonly type: ProviderTypeExpression;
  readonly optional?: boolean;
  readonly rest?: boolean;
}

export interface NodePathCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodePathProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export interface NodePathPropertyTargetMember {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}
