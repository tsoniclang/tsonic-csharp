import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  boolProviderType,
  nodeUrlUnknownParameter,
  objectProviderType,
  stringProviderType,
  urlProviderType,
} from "./helpers.js";
import type {
  NodeUrlUnsupportedTargetIdentity,
} from "./types.js";

export interface NodeUrlUnsupportedFunctionDeclaration {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

export interface NodeUrlUnsupportedClassMemberDeclaration {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly memberKind: "constructor" | "method" | "property";
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly signatureId?: string;
  readonly providerParameters?: readonly ProviderParameterDeclaration[];
  readonly providerReturnType?: ProviderTypeExpression;
  readonly providerType?: ProviderTypeExpression;
  readonly readonly?: true;
}

export function nodeUrlUnsupportedTargetIdentities(): readonly NodeUrlUnsupportedTargetIdentity[] {
  return [
    ...nodeUrlUnsupportedFunctionDeclarations().map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
      exportName,
      signatureId,
      targetIdentityId,
      displayName,
    })),
    ...nodeUrlUnsupportedClassMemberDeclarations().map(({ exportName, memberName, signatureId, targetIdentityId, displayName }) => ({
      exportName,
      memberName,
      ...(signatureId !== undefined ? { signatureId } : {}),
      targetIdentityId,
      displayName,
    })),
  ];
}

export function nodeUrlUnsupportedFunctionDeclarations(): readonly NodeUrlUnsupportedFunctionDeclaration[] {
  return [
    {
      exportName: "format",
      signatureId: "node:url.format(System.Object)",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.url.format(System.Object)",
      displayName: "unsupported NodeJS url.format",
      providerParameters: [nodeUrlUnknownParameter("urlObject")],
      providerReturnType: stringProviderType,
    },
    {
      exportName: "urlToHttpOptions",
      signatureId: "node:url.urlToHttpOptions(Tsonic.CSharp.Node.URL)",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.url.urlToHttpOptions(Tsonic.CSharp.Node.URL)",
      displayName: "unsupported NodeJS url.urlToHttpOptions",
      providerParameters: [{ name: "url", type: urlProviderType }],
      providerReturnType: objectProviderType,
    },
  ];
}

export function nodeUrlUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [
    ...nodeUrlUrlUnsupportedClassMemberDeclarations(),
    ...nodeUrlUrlSearchParamsUnsupportedClassMemberDeclarations(),
    ...nodeUrlUrlPatternUnsupportedClassMemberDeclarations(),
  ];
}

export function nodeUrlUrlUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [];
}

export function nodeUrlUrlSearchParamsUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [];
}

export function nodeUrlUrlPatternUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [
    {
      exportName: "URLPattern",
      memberName: "constructor",
      memberId: "node:url.URLPattern.constructor",
      memberKind: "constructor",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLPattern.constructor(System.String)",
      displayName: "unsupported NodeJS URLPattern.constructor",
      signatureId: "node:url.URLPattern.constructor(System.String)",
      providerParameters: [{ name: "pattern", type: stringProviderType }],
    },
    {
      exportName: "URLPattern",
      memberName: "test",
      memberId: "node:url.URLPattern.test",
      memberKind: "method",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLPattern.test(System.String)",
      displayName: "unsupported NodeJS URLPattern.test",
      signatureId: "node:url.URLPattern.test(System.String)",
      providerParameters: [{ name: "input", type: stringProviderType }],
      providerReturnType: boolProviderType,
    },
    {
      exportName: "URLPattern",
      memberName: "exec",
      memberId: "node:url.URLPattern.exec",
      memberKind: "method",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLPattern.exec(System.String)",
      displayName: "unsupported NodeJS URLPattern.exec",
      signatureId: "node:url.URLPattern.exec(System.String)",
      providerParameters: [{ name: "input", type: stringProviderType }],
      providerReturnType: { kind: "union", types: [objectProviderType, { kind: "literal", value: null }] },
    },
  ];
}
