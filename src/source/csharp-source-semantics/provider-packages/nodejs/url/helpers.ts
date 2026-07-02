import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
} from "../../../target-types.js";
import {
  csharpVoidTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../../surfaces/js/source-library.js";

export const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
export const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
export const objectProviderType = { kind: "object" } satisfies ProviderTypeExpression;
export const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
export const nodeUrlModuleSpecifier = "node:url";
export const urlProviderType = { kind: "provider-ref", moduleSpecifier: nodeUrlModuleSpecifier, exportName: "URL" } satisfies ProviderTypeExpression;
export const nullableUrlProviderType = { kind: "union", types: [urlProviderType, { kind: "literal", value: null }] } satisfies ProviderTypeExpression;
export const urlSearchParamsProviderType = { kind: "provider-ref", moduleSpecifier: nodeUrlModuleSpecifier, exportName: "URLSearchParams" } satisfies ProviderTypeExpression;
export const bufferProviderType = { kind: "provider-ref", moduleSpecifier: "node:buffer", exportName: "Buffer" } satisfies ProviderTypeExpression;
export const nullableStringProviderType = { kind: "union", types: [stringProviderType, { kind: "literal", value: null }] } satisfies ProviderTypeExpression;

export const stringTargetType = csharpStringTargetType();
export const boolTargetType = csharpSourcePrimitiveTargetType("bool");
export const numberTargetType = csharpSourcePrimitiveTargetType("int32");
export const voidTargetType = csharpVoidTargetType();
export const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
export const urlTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.URL", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "URL"));
export const nullableUrlTargetType = csharpNullableTargetType(urlTargetType);
export const nullableStringTargetType = csharpNullableTargetType(stringTargetType);
export const urlSearchParamsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.URLSearchParams", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "URLSearchParams"));
export const bufferTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Buffer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Buffer"));
export const urlModuleTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.url", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "url"));

export function nodeUrlStringParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: stringProviderType,
  };
}

export function nodeUrlOptionalStringParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: stringProviderType,
    optional: true,
  };
}

export function nodeUrlUrlParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: urlProviderType,
  };
}

export function nodeUrlUnknownParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
  };
}
