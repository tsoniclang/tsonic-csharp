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
  nodeUrlSignatureParameters,
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
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

export interface NodeUrlUnsupportedClassMemberDeclaration {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly memberKind: "constructor" | "method" | "property";
  readonly signatureId?: string;
  readonly providerParameters?: readonly ProviderParameterDeclaration[];
  readonly providerReturnType?: ProviderTypeExpression;
  readonly providerType?: ProviderTypeExpression;
  readonly readonly?: true;
}

export function nodeUrlUnsupportedTargetIdentities(): readonly NodeUrlUnsupportedTargetIdentity[] {
  return [
    ...nodeUrlUnsupportedFunctionDeclarations().map((declaration) =>
      unsupportedUrlFunctionTargetIdentity(declaration.exportName, declaration.signatureId)
    ),
    ...nodeUrlUnsupportedClassMemberDeclarations().map((declaration) =>
      unsupportedUrlClassMemberTargetIdentity(declaration.exportName, declaration.memberName, declaration.signatureId)
    ),
  ];
}

export function nodeUrlUnsupportedFunctionDeclarations(): readonly NodeUrlUnsupportedFunctionDeclaration[] {
  return [
    {
      exportName: "format",
      signatureId: "node:url.format(System.Object)",
      providerParameters: [nodeUrlUnknownParameter("urlObject")],
      providerReturnType: stringProviderType,
    },
    {
      exportName: "urlToHttpOptions",
      signatureId: "node:url.urlToHttpOptions(Tsonic.CSharp.Node.URL)",
      providerParameters: [{ name: "url", type: urlProviderType }],
      providerReturnType: objectProviderType,
    },
  ];
}

export function nodeUrlUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
  return [
    {
      exportName: nodeUrlUrlExportName,
      memberName: "searchParams",
      memberId: "node:url.URL.searchParams",
      memberKind: "property",
      providerType: urlSearchParamsProviderType,
      readonly: true,
    },
    {
      exportName: "URLSearchParams",
      memberName: "constructor",
      memberId: "node:url.URLSearchParams.constructor",
      memberKind: "constructor",
      signatureId: "node:url.URLSearchParams.constructor(System.String)",
      providerParameters: [{ name: "init", type: stringProviderType, optional: true }],
    },
    {
      exportName: "URLSearchParams",
      memberName: "size",
      memberId: "node:url.URLSearchParams.size",
      memberKind: "property",
      providerType: numberProviderType,
      readonly: true,
    },
    {
      exportName: "URLSearchParams",
      memberName: "append",
      memberId: "node:url.URLSearchParams.append",
      memberKind: "method",
      signatureId: "node:url.URLSearchParams.append(System.String,System.String)",
      providerParameters: [{ name: "name", type: stringProviderType }, { name: "value", type: stringProviderType }],
      providerReturnType: voidProviderType,
    },
    {
      exportName: "URLSearchParams",
      memberName: "get",
      memberId: "node:url.URLSearchParams.get",
      memberKind: "method",
      signatureId: "node:url.URLSearchParams.get(System.String)",
      providerParameters: [{ name: "name", type: stringProviderType }],
      providerReturnType: { kind: "union", types: [stringProviderType, { kind: "literal", value: null }] },
    },
    {
      exportName: "URLSearchParams",
      memberName: "toString",
      memberId: "node:url.URLSearchParams.toString",
      memberKind: "method",
      signatureId: "node:url.URLSearchParams.toString()",
      providerParameters: [],
      providerReturnType: stringProviderType,
    },
    {
      exportName: "URLPattern",
      memberName: "constructor",
      memberId: "node:url.URLPattern.constructor",
      memberKind: "constructor",
      signatureId: "node:url.URLPattern.constructor(System.String)",
      providerParameters: [{ name: "pattern", type: stringProviderType }],
    },
    {
      exportName: "URLPattern",
      memberName: "test",
      memberId: "node:url.URLPattern.test",
      memberKind: "method",
      signatureId: "node:url.URLPattern.test(System.String)",
      providerParameters: [{ name: "input", type: stringProviderType }],
      providerReturnType: boolProviderType,
    },
    {
      exportName: "URLPattern",
      memberName: "exec",
      memberId: "node:url.URLPattern.exec",
      memberKind: "method",
      signatureId: "node:url.URLPattern.exec(System.String)",
      providerParameters: [{ name: "input", type: stringProviderType }],
      providerReturnType: { kind: "union", types: [objectProviderType, { kind: "literal", value: null }] },
    },
  ];
}

function unsupportedUrlFunctionTargetIdentity(
  exportName: string,
  signatureId: string,
): NodeUrlUnsupportedTargetIdentity {
  return {
    exportName,
    signatureId,
    targetIdentityId: `unsupported:Tsonic.CSharp.Node.url.${exportName}(${nodeUrlSignatureParameters(signatureId, `node:url.${exportName}`)})`,
    displayName: `unsupported NodeJS url.${exportName}`,
  };
}

function unsupportedUrlClassMemberTargetIdentity(
  exportName: string,
  memberName: string,
  signatureId: string | undefined,
): NodeUrlUnsupportedTargetIdentity {
  const signatureSuffix = signatureId === undefined ? "" : `(${nodeUrlSignatureParameters(signatureId, `node:url.${exportName}.${memberName}`)})`;
  return {
    exportName,
    memberName,
    ...(signatureId !== undefined ? { signatureId } : {}),
    targetIdentityId: `unsupported:Tsonic.CSharp.Node.${exportName}.${memberName}${signatureSuffix}`,
    displayName: `unsupported NodeJS ${exportName}.${memberName}`,
  };
}
