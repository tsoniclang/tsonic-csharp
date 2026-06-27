import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
} from "../../../target-types.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../js/source-library.js";

export const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
export const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
export const objectProviderType = { kind: "object" } satisfies ProviderTypeExpression;
export const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
export const urlProviderType = { kind: "provider-ref", name: "URL" } satisfies ProviderTypeExpression;
export const nullableUrlProviderType = { kind: "union", types: [urlProviderType, { kind: "literal", value: null }] } satisfies ProviderTypeExpression;
export const urlSearchParamsProviderType = { kind: "provider-ref", name: "URLSearchParams" } satisfies ProviderTypeExpression;
export const bufferProviderType = { kind: "provider-ref", moduleSpecifier: "node:buffer", name: "Buffer" } satisfies ProviderTypeExpression;

export const stringTargetType = csharpStringTargetType();
export const boolTargetType = csharpSourcePrimitiveTargetType("bool");
export const urlTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.URL", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "URL"));
export const nullableUrlTargetType = csharpNullableTargetType(urlTargetType);
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
