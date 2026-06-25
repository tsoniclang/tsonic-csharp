import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetMethod,
  targetParameter,
  targetProperty,
} from "../../js/source-library.js";
import {
  nodeUrlFileUrlToPathExportName,
  nodeUrlFileUrlToPathStringSignatureId,
  nodeUrlFileUrlToPathUrlSignatureId,
  nodeUrlPathToFileUrlExportName,
  nodeUrlPathToFileUrlSignatureId,
  nodeUrlUrlCanParseMemberId,
  nodeUrlUrlCanParseSignatureId,
  nodeUrlUrlConstructorMemberId,
  nodeUrlUrlConstructorSignatureId,
  nodeUrlUrlExportName,
  nodeUrlUrlHrefMemberId,
} from "./identities.js";
import {
  boolProviderType,
  boolTargetType,
  bufferProviderType,
  bufferTargetType,
  nullableUrlProviderType,
  nullableUrlTargetType,
  nodeUrlOptionalStringParameter,
  nodeUrlSignatureParameters,
  nodeUrlStringParameter,
  nodeUrlUrlParameter,
  stringProviderType,
  stringTargetType,
  urlModuleTargetType,
  urlProviderType,
  urlTargetType,
} from "./helpers.js";
import type {
  NodeUrlCallTargetMember,
  NodeUrlClassCallTargetMember,
  NodeUrlClassPropertyTargetMember,
} from "./types.js";

export function getNodeUrlTargetMember(memberId: string | undefined, signatureId: string | undefined): TargetMember | undefined {
  return nodeUrlTargetMembersByIdentity.get(signatureId ?? memberId ?? "");
}

export function nodeUrlCallTargetMembers(): readonly NodeUrlCallTargetMember[] {
  return [
    urlModuleCall("domainToASCII", "node:url.domainToASCII(System.String)", [nodeUrlStringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("domainToUnicode", "node:url.domainToUnicode(System.String)", [nodeUrlStringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("parse", "node:url.parse(System.String)", [nodeUrlStringParameter("input")], nullableUrlProviderType, [
      targetParameter("input", stringTargetType),
    ], nullableUrlTargetType),
    urlModuleCall("resolve", "node:url.resolve(System.String,System.String)", [nodeUrlStringParameter("from"), nodeUrlStringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlPathToFileUrlExportName, nodeUrlPathToFileUrlSignatureId, [nodeUrlStringParameter("filePath")], urlProviderType, [
      targetParameter("filePath", stringTargetType),
    ], urlTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathStringSignatureId, [nodeUrlStringParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathUrlSignatureId, [nodeUrlUrlParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", urlTargetType),
    ], stringTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(System.String)", [nodeUrlStringParameter("fileUrl")], bufferProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], bufferTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", [nodeUrlUrlParameter("fileUrl")], bufferProviderType, [
      targetParameter("fileUrl", urlTargetType),
    ], bufferTargetType),
  ];
}

export function nodeUrlClassCallTargetMembers(): readonly NodeUrlClassCallTargetMember[] {
  return [
    urlClassConstructor([nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ]),
    urlClassMethod(nodeUrlUrlExportName, "canParse", nodeUrlUrlCanParseMemberId, nodeUrlUrlCanParseSignatureId, [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], boolProviderType, [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], boolTargetType, { static: true }),
    urlClassMethod(nodeUrlUrlExportName, "parse", "node:url.URL.parse", "node:url.URL.parse(System.String,System.String)", [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], nullableUrlProviderType, [
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
      `Tsonic.CSharp.Node.url.${exportName}(${nodeUrlSignatureParameters(signatureId, `node:url.${exportName}`)})`,
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
      `Tsonic.CSharp.Node.${exportName}.${targetName}(${nodeUrlSignatureParameters(signatureId, `node:url.${exportName}.${memberName}`)})`,
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

const nodeUrlTargetMembersByIdentity = new Map<string, TargetMember>([
  ...nodeUrlCallTargetMembers().map((entry) => [entry.signatureId, entry.member] as const),
  ...nodeUrlClassCallTargetMembers().flatMap((entry) => [
    [entry.memberId, entry.member] as const,
    [entry.signatureId, entry.member] as const,
  ]),
  ...nodeUrlClassPropertyTargetMembers().map((entry) => [entry.memberId, entry.member] as const),
]);
