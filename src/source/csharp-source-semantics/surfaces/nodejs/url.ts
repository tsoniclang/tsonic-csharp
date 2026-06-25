import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
} from "../../target-types.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const objectProviderType = { kind: "object" } satisfies ProviderTypeExpression;
const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const urlProviderType = { kind: "provider-ref", name: "URL" } satisfies ProviderTypeExpression;
const nullableUrlProviderType = { kind: "union", types: [urlProviderType, { kind: "literal", value: null }] } satisfies ProviderTypeExpression;
const urlSearchParamsProviderType = { kind: "provider-ref", name: "URLSearchParams" } satisfies ProviderTypeExpression;
const bufferProviderType = { kind: "provider-ref", moduleSpecifier: "node:buffer", name: "Buffer" } satisfies ProviderTypeExpression;

const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const urlTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.URL", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "URL"));
const nullableUrlTargetType = csharpNullableTargetType(urlTargetType);
const bufferTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Buffer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Buffer"));
const urlModuleTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.url", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "url"));

export interface NodeUrlCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export interface NodeUrlClassCallTargetMember {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly signatureId: string;
  readonly memberKind: "constructor" | "method";
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType?: ProviderTypeExpression;
  readonly static?: boolean;
  readonly member: TargetMember;
}

export interface NodeUrlClassPropertyTargetMember {
  readonly exportName: string;
  readonly memberName: string;
  readonly memberId: string;
  readonly providerType: ProviderTypeExpression;
  readonly readonly?: true;
  readonly member: TargetMember;
}

export interface NodeUrlUnsupportedTargetIdentity {
  readonly exportName: string;
  readonly memberName?: string;
  readonly signatureId?: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
}

interface NodeUrlUnsupportedFunctionDeclaration {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

interface NodeUrlUnsupportedClassMemberDeclaration {
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

export const nodeUrlModuleSpecifier = "node:url";
export const nodeUrlUrlExportName = "URL";
export const nodeUrlUrlConstructorMemberId = "node:url.URL.constructor";
export const nodeUrlUrlConstructorSignatureId = "node:url.URL.constructor(System.String,System.String)";
export const nodeUrlUrlHrefMemberId = "node:url.URL.href";
export const nodeUrlUrlCanParseMemberId = "node:url.URL.canParse";
export const nodeUrlUrlCanParseSignatureId = "node:url.URL.canParse(System.String,System.String)";
export const nodeUrlPathToFileUrlExportName = "pathToFileURL";
export const nodeUrlPathToFileUrlSignatureId = "node:url.pathToFileURL(System.String)";
export const nodeUrlFileUrlToPathExportName = "fileURLToPath";
export const nodeUrlFileUrlToPathStringSignatureId = "node:url.fileURLToPath(System.String)";
export const nodeUrlFileUrlToPathUrlSignatureId = "node:url.fileURLToPath(Tsonic.CSharp.Node.URL)";

export function nodeUrlExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeUrlUrlExportDeclaration(),
    nodeUrlUrlSearchParamsExportDeclaration(),
    nodeUrlUrlPatternExportDeclaration(),
    ...nodeUrlCallExportDeclarations(),
    ...nodeUrlUnsupportedFunctionDeclarations().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:url.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
    })),
  ];
}

function nodeUrlCallExportDeclarations(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeUrlCallTargetMember[]>();
  for (const member of nodeUrlCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  return [...membersByExportName.entries()].map(([exportName, members]) => ({
    id: `node:url.${exportName}`,
    name: exportName,
    kind: "function" as const,
    signatures: members.map((member) => ({
      id: member.signatureId,
      parameters: member.providerParameters,
      returnType: member.providerReturnType,
    })),
  }));
}

export function getNodeUrlTargetMember(memberId: string | undefined, signatureId: string | undefined): TargetMember | undefined {
  return nodeUrlTargetMembersByIdentity.get(signatureId ?? memberId ?? "");
}

export function nodeUrlCallTargetMembers(): readonly NodeUrlCallTargetMember[] {
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  const urlParameter = (name: string): ProviderParameterDeclaration => ({ name, type: urlProviderType });
  return [
    urlModuleCall("domainToASCII", "node:url.domainToASCII(System.String)", [stringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("domainToUnicode", "node:url.domainToUnicode(System.String)", [stringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("parse", "node:url.parse(System.String)", [stringParameter("input")], nullableUrlProviderType, [
      targetParameter("input", stringTargetType),
    ], nullableUrlTargetType),
    urlModuleCall("resolve", "node:url.resolve(System.String,System.String)", [stringParameter("from"), stringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlPathToFileUrlExportName, nodeUrlPathToFileUrlSignatureId, [stringParameter("filePath")], urlProviderType, [
      targetParameter("filePath", stringTargetType),
    ], urlTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathStringSignatureId, [stringParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathUrlSignatureId, [urlParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", urlTargetType),
    ], stringTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(System.String)", [stringParameter("fileUrl")], bufferProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], bufferTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", [urlParameter("fileUrl")], bufferProviderType, [
      targetParameter("fileUrl", urlTargetType),
    ], bufferTargetType),
  ];
}

export function nodeUrlClassCallTargetMembers(): readonly NodeUrlClassCallTargetMember[] {
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType, optional: true });
  return [
    urlClassConstructor([stringParameter("input"), optionalStringParameter("base")], [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ]),
    urlClassMethod(nodeUrlUrlExportName, "canParse", nodeUrlUrlCanParseMemberId, nodeUrlUrlCanParseSignatureId, [stringParameter("input"), optionalStringParameter("base")], boolProviderType, [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], boolTargetType, { static: true }),
    urlClassMethod(nodeUrlUrlExportName, "parse", "node:url.URL.parse", "node:url.URL.parse(System.String,System.String)", [stringParameter("input"), optionalStringParameter("base")], nullableUrlProviderType, [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], nullableUrlTargetType, { static: true }),
    urlClassMethod(nodeUrlUrlExportName, "toString", "node:url.URL.toString", "node:url.URL.toString()", [], stringProviderType, [], stringTargetType, { targetName: "ToString" }),
    urlClassMethod(nodeUrlUrlExportName, "toJSON", "node:url.URL.toJSON", "node:url.URL.toJSON()", [], stringProviderType, [], stringTargetType),
  ];
}

export function nodeUrlClassPropertyTargetMembers(): readonly NodeUrlClassPropertyTargetMember[] {
  return [
    urlClassProperty("href", nodeUrlUrlHrefMemberId),
    urlClassProperty("protocol", "node:url.URL.protocol"),
    urlClassProperty("username", "node:url.URL.username"),
    urlClassProperty("password", "node:url.URL.password"),
    urlClassProperty("host", "node:url.URL.host"),
    urlClassProperty("hostname", "node:url.URL.hostname"),
    urlClassProperty("port", "node:url.URL.port"),
    urlClassProperty("pathname", "node:url.URL.pathname"),
    urlClassProperty("search", "node:url.URL.search"),
    urlClassProperty("hash", "node:url.URL.hash"),
    urlClassProperty("origin", "node:url.URL.origin", { readonly: true }),
  ];
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

function nodeUrlUrlExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:url.${nodeUrlUrlExportName}`,
    name: nodeUrlUrlExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: urlTargetType.id,
      displayName: "Tsonic.CSharp.Node.URL",
    },
    members: [
      ...nodeUrlClassCallTargetMembers().map(providerMemberForUrlClassCall),
      ...nodeUrlClassPropertyTargetMembers().map(providerMemberForUrlClassProperty),
      ...nodeUrlUnsupportedClassMemberDeclarations()
        .filter((member) => member.exportName === nodeUrlUrlExportName)
        .map(providerMemberForUnsupportedUrlClassMember),
    ],
  };
}

function nodeUrlUrlSearchParamsExportDeclaration(): ProviderExportDeclaration {
  return unsupportedClassExportDeclaration("URLSearchParams");
}

function nodeUrlUrlPatternExportDeclaration(): ProviderExportDeclaration {
  return unsupportedClassExportDeclaration("URLPattern");
}

function unsupportedClassExportDeclaration(exportName: string): ProviderExportDeclaration {
  return {
    id: `node:url.${exportName}`,
    name: exportName,
    kind: "class",
    members: nodeUrlUnsupportedClassMemberDeclarations()
      .filter((member) => member.exportName === exportName)
      .map(providerMemberForUnsupportedUrlClassMember),
  };
}

function providerMemberForUrlClassCall(member: NodeUrlClassCallTargetMember): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: member.memberKind,
    ...(member.static === true ? { static: true } : {}),
    signatures: [{
      id: member.signatureId,
      parameters: member.providerParameters,
      ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
    }],
  };
}

function providerMemberForUrlClassProperty(member: NodeUrlClassPropertyTargetMember): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: "property",
    ...(member.readonly === true ? { readonly: true } : {}),
    type: member.providerType,
  };
}

function providerMemberForUnsupportedUrlClassMember(member: NodeUrlUnsupportedClassMemberDeclaration): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: member.memberKind,
    ...(member.readonly === true ? { readonly: true } : {}),
    ...(member.providerType !== undefined ? { type: member.providerType } : {}),
    ...(member.signatureId !== undefined
      ? {
        signatures: [{
          id: member.signatureId,
          parameters: member.providerParameters ?? [],
          ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
        }],
      }
      : {}),
  };
}

function nodeUrlUnsupportedFunctionDeclarations(): readonly NodeUrlUnsupportedFunctionDeclaration[] {
  return [
    {
      exportName: "format",
      signatureId: "node:url.format(System.Object)",
      providerParameters: [unknownParameter("urlObject")],
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

function nodeUrlUnsupportedClassMemberDeclarations(): readonly NodeUrlUnsupportedClassMemberDeclaration[] {
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

function urlModuleCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
): NodeUrlCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: targetMethod(
      `Tsonic.CSharp.Node.url.${exportName}(${signatureParameters(signatureId, `node:url.${exportName}`)})`,
      exportName,
      exportName,
      targetParameters,
      targetReturnType,
      {
        declaringType: urlModuleTargetType,
        static: true,
      },
    ),
  };
}

function urlClassConstructor(
  providerParameters: readonly ProviderParameterDeclaration[],
  targetParameters: readonly TargetParameter[],
): NodeUrlClassCallTargetMember {
  return {
    exportName: nodeUrlUrlExportName,
    memberName: "constructor",
    memberId: nodeUrlUrlConstructorMemberId,
    signatureId: nodeUrlUrlConstructorSignatureId,
    memberKind: "constructor",
    providerParameters,
    member: {
      id: "Tsonic.CSharp.Node.URL..ctor(System.String,System.String)",
      sourceName: "constructor",
      targetName: "URL",
      kind: "constructor",
      parameters: targetParameters,
      returnType: urlTargetType,
      declaringType: urlTargetType,
    },
  };
}

function urlClassMethod(
  exportName: string,
  memberName: string,
  memberId: string,
  signatureId: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
  options: { readonly static?: boolean; readonly targetName?: string } = {},
): NodeUrlClassCallTargetMember {
  const targetName = options.targetName ?? memberName;
  return {
    exportName,
    memberName,
    memberId,
    signatureId,
    memberKind: "method",
    providerParameters,
    providerReturnType,
    ...(options.static === true ? { static: true } : {}),
    member: targetMethod(
      `Tsonic.CSharp.Node.${exportName}.${targetName}(${signatureParameters(signatureId, `node:url.${exportName}.${memberName}`)})`,
      memberName,
      targetName,
      targetParameters,
      targetReturnType,
      {
        declaringType: urlTargetType,
        ...(options.static === true ? { static: true } : {}),
      },
    ),
  };
}

function urlClassProperty(
  memberName: string,
  memberId: string,
  options: { readonly readonly?: true } = {},
): NodeUrlClassPropertyTargetMember {
  return {
    exportName: nodeUrlUrlExportName,
    memberName,
    memberId,
    providerType: stringProviderType,
    ...(options.readonly === true ? { readonly: true } : {}),
    member: targetProperty(`Tsonic.CSharp.Node.URL.${memberName}`, memberName, memberName, stringTargetType, {
      declaringType: urlTargetType,
    }),
  };
}

function unsupportedUrlFunctionTargetIdentity(
  exportName: string,
  signatureId: string,
): NodeUrlUnsupportedTargetIdentity {
  return {
    exportName,
    signatureId,
    targetIdentityId: `unsupported:Tsonic.CSharp.Node.url.${exportName}(${signatureParameters(signatureId, `node:url.${exportName}`)})`,
    displayName: `unsupported NodeJS url.${exportName}`,
  };
}

function unsupportedUrlClassMemberTargetIdentity(
  exportName: string,
  memberName: string,
  signatureId: string | undefined,
): NodeUrlUnsupportedTargetIdentity {
  const signatureSuffix = signatureId === undefined ? "" : `(${signatureParameters(signatureId, `node:url.${exportName}.${memberName}`)})`;
  return {
    exportName,
    memberName,
    ...(signatureId !== undefined ? { signatureId } : {}),
    targetIdentityId: `unsupported:Tsonic.CSharp.Node.${exportName}.${memberName}${signatureSuffix}`,
    displayName: `unsupported NodeJS ${exportName}.${memberName}`,
  };
}

function unknownParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
  };
}

function signatureParameters(signatureId: string, prefix: string): string {
  return signatureId.slice(prefix.length + 1, -1);
}

const nodeUrlTargetMembersByIdentity = new Map<string, TargetMember>([
  ...nodeUrlCallTargetMembers().map((entry) => [entry.signatureId, entry.member] as const),
  ...nodeUrlClassCallTargetMembers().flatMap((entry) => [
    [entry.memberId, entry.member] as const,
    [entry.signatureId, entry.member] as const,
  ]),
  ...nodeUrlClassPropertyTargetMembers().map((entry) => [entry.memberId, entry.member] as const),
]);
