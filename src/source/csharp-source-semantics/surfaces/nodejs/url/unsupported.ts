import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  nodeUrlUrlExportName,
} from "./identities.js";
import {
  boolProviderType,
  numberProviderType,
  nodeUrlUnknownParameter,
  objectProviderType,
  stringProviderType,
  urlProviderType,
  urlSearchParamsProviderType,
  voidProviderType,
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
  return [
    {
      exportName: nodeUrlUrlExportName,
      memberName: "searchParams",
      memberId: "node:url.URL.searchParams",
      memberKind: "property",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URL.searchParams",
      displayName: "unsupported NodeJS URL.searchParams",
      providerType: urlSearchParamsProviderType,
      readonly: true,
    },
  ];
}

export function nodeUrlUrlSearchParamsUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [
    {
      exportName: "URLSearchParams",
      memberName: "constructor",
      memberId: "node:url.URLSearchParams.constructor",
      memberKind: "constructor",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLSearchParams.constructor(System.String)",
      displayName: "unsupported NodeJS URLSearchParams.constructor",
      signatureId: "node:url.URLSearchParams.constructor(System.String)",
      providerParameters: [{ name: "init", type: stringProviderType, optional: true }],
    },
    {
      exportName: "URLSearchParams",
      memberName: "size",
      memberId: "node:url.URLSearchParams.size",
      memberKind: "property",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLSearchParams.size",
      displayName: "unsupported NodeJS URLSearchParams.size",
      providerType: numberProviderType,
      readonly: true,
    },
    {
      exportName: "URLSearchParams",
      memberName: "append",
      memberId: "node:url.URLSearchParams.append",
      memberKind: "method",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLSearchParams.append(System.String,System.String)",
      displayName: "unsupported NodeJS URLSearchParams.append",
      signatureId: "node:url.URLSearchParams.append(System.String,System.String)",
      providerParameters: [{ name: "name", type: stringProviderType }, { name: "value", type: stringProviderType }],
      providerReturnType: voidProviderType,
    },
    {
      exportName: "URLSearchParams",
      memberName: "get",
      memberId: "node:url.URLSearchParams.get",
      memberKind: "method",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLSearchParams.get(System.String)",
      displayName: "unsupported NodeJS URLSearchParams.get",
      signatureId: "node:url.URLSearchParams.get(System.String)",
      providerParameters: [{ name: "name", type: stringProviderType }],
      providerReturnType: { kind: "union", types: [stringProviderType, { kind: "literal", value: null }] },
    },
    {
      exportName: "URLSearchParams",
      memberName: "toString",
      memberId: "node:url.URLSearchParams.toString",
      memberKind: "method",
      targetIdentityId: "unsupported:Tsonic.CSharp.Node.URLSearchParams.toString()",
      displayName: "unsupported NodeJS URLSearchParams.toString",
      signatureId: "node:url.URLSearchParams.toString()",
      providerParameters: [],
      providerReturnType: stringProviderType,
    },
  ];
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
