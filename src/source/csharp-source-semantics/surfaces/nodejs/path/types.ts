import type {
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  NodejsModuleCallTargetMetadata,
  NodejsModulePropertyTargetMetadata,
} from "../members/target-member-metadata.js";
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

export type NodePathCallTargetMember = NodejsModuleCallTargetMetadata;

export type NodePathPropertyTargetMember = NodejsModulePropertyTargetMetadata;
