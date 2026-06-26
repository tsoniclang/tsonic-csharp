import type {
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpVoidTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../../js/source-library.js";
import {
  csharpJsDateTargetType,
} from "../../js/date/index.js";

export const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
export const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
export const dateProviderType = {
  kind: "target-named",
  target: "csharp",
  id: "Tsonic.CSharp.Js.Date",
  displayName: "Date",
  sourceShape: { kind: "provider-ref", name: "Date" },
} satisfies ProviderTypeExpression;
export const stringTargetType = csharpStringTargetType();
export const boolTargetType = csharpSourcePrimitiveTargetType("bool");
export const intTargetType = csharpSourcePrimitiveTargetType("int32");
export const longTargetType = csharpSourcePrimitiveTargetType("int64");
export const doubleTargetType = csharpSourcePrimitiveTargetType("float64");
export const voidTargetType = csharpVoidTargetType();
export const dateTargetType = csharpJsDateTargetType();
export const fsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.fs", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "fs"));
export const statsProviderType = { kind: "provider-ref", name: "Stats" } satisfies ProviderTypeExpression;
export const statsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Stats", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Stats"));

export interface NodeFsProviderParameter {
  readonly name: string;
  readonly type: ProviderTypeExpression;
  readonly optional?: boolean;
}

export interface NodeFsCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodeFsProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export type {
  ProviderTypeExpression,
  TargetTypeRef,
};
