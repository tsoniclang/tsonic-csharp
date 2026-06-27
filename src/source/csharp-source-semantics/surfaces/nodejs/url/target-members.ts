import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetParameter,
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

export function nodeUrlCallTargetMembers(): readonly NodeUrlCallTargetMember[] {
  return [
    urlModuleCall("domainToASCII", "node:url.domainToASCII(System.String)", "Tsonic.CSharp.Node.url.domainToASCII(System.String)", "domainToASCII", [nodeUrlStringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("domainToUnicode", "node:url.domainToUnicode(System.String)", "Tsonic.CSharp.Node.url.domainToUnicode(System.String)", "domainToUnicode", [nodeUrlStringParameter("domain")], stringProviderType, [
      targetParameter("domain", stringTargetType),
    ], stringTargetType),
    urlModuleCall("parse", "node:url.parse(System.String)", "Tsonic.CSharp.Node.url.parse(System.String)", "parse", [nodeUrlStringParameter("input")], nullableUrlProviderType, [
      targetParameter("input", stringTargetType),
    ], nullableUrlTargetType),
    urlModuleCall("resolve", "node:url.resolve(System.String,System.String)", "Tsonic.CSharp.Node.url.resolve(System.String,System.String)", "resolve", [nodeUrlStringParameter("from"), nodeUrlStringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlPathToFileUrlExportName, nodeUrlPathToFileUrlSignatureId, "Tsonic.CSharp.Node.url.pathToFileURL(System.String)", "pathToFileURL", [nodeUrlStringParameter("filePath")], urlProviderType, [
      targetParameter("filePath", stringTargetType),
    ], urlTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathStringSignatureId, "Tsonic.CSharp.Node.url.fileURLToPath(System.String)", "fileURLToPath", [nodeUrlStringParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], stringTargetType),
    urlModuleCall(nodeUrlFileUrlToPathExportName, nodeUrlFileUrlToPathUrlSignatureId, "Tsonic.CSharp.Node.url.fileURLToPath(Tsonic.CSharp.Node.URL)", "fileURLToPath", [nodeUrlUrlParameter("fileUrl")], stringProviderType, [
      targetParameter("fileUrl", urlTargetType),
    ], stringTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(System.String)", "Tsonic.CSharp.Node.url.fileURLToPathBuffer(System.String)", "fileURLToPathBuffer", [nodeUrlStringParameter("fileUrl")], bufferProviderType, [
      targetParameter("fileUrl", stringTargetType),
    ], bufferTargetType),
    urlModuleCall("fileURLToPathBuffer", "node:url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", "Tsonic.CSharp.Node.url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", "fileURLToPathBuffer", [nodeUrlUrlParameter("fileUrl")], bufferProviderType, [
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
    urlClassMethod(nodeUrlUrlExportName, "canParse", nodeUrlUrlCanParseMemberId, nodeUrlUrlCanParseSignatureId, "Tsonic.CSharp.Node.URL.canParse(System.String,System.String)", "canParse", [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], boolProviderType, [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], boolTargetType, { static: true }),
    urlClassMethod(nodeUrlUrlExportName, "parse", "node:url.URL.parse", "node:url.URL.parse(System.String,System.String)", "Tsonic.CSharp.Node.URL.parse(System.String,System.String)", "parse", [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], nullableUrlProviderType, [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], nullableUrlTargetType, { static: true }),
    urlClassMethod(nodeUrlUrlExportName, "toString", "node:url.URL.toString", "node:url.URL.toString()", "Tsonic.CSharp.Node.URL.ToString()", "ToString", [], stringProviderType, [], stringTargetType),
    urlClassMethod(nodeUrlUrlExportName, "toJSON", "node:url.URL.toJSON", "node:url.URL.toJSON()", "Tsonic.CSharp.Node.URL.toJSON()", "toJSON", [], stringProviderType, [], stringTargetType),
  ];
}

export function nodeUrlClassPropertyTargetMembers(): readonly NodeUrlClassPropertyTargetMember[] {
  return [
    urlClassProperty("href", nodeUrlUrlHrefMemberId, "Tsonic.CSharp.Node.URL.href", "href"),
    urlClassProperty("protocol", "node:url.URL.protocol", "Tsonic.CSharp.Node.URL.protocol", "protocol"),
    urlClassProperty("username", "node:url.URL.username", "Tsonic.CSharp.Node.URL.username", "username"),
    urlClassProperty("password", "node:url.URL.password", "Tsonic.CSharp.Node.URL.password", "password"),
    urlClassProperty("host", "node:url.URL.host", "Tsonic.CSharp.Node.URL.host", "host"),
    urlClassProperty("hostname", "node:url.URL.hostname", "Tsonic.CSharp.Node.URL.hostname", "hostname"),
    urlClassProperty("port", "node:url.URL.port", "Tsonic.CSharp.Node.URL.port", "port"),
    urlClassProperty("pathname", "node:url.URL.pathname", "Tsonic.CSharp.Node.URL.pathname", "pathname"),
    urlClassProperty("search", "node:url.URL.search", "Tsonic.CSharp.Node.URL.search", "search"),
    urlClassProperty("hash", "node:url.URL.hash", "Tsonic.CSharp.Node.URL.hash", "hash"),
    urlClassProperty("origin", "node:url.URL.origin", "Tsonic.CSharp.Node.URL.origin", "origin", { readonly: true }),
  ];
}

function urlModuleCall(
  sourceName: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
): NodeUrlCallTargetMember {
  return {
    exportName: sourceName,
    signatureId,
    targetMemberId,
    targetName,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: urlModuleTargetType,
      static: true,
    },
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
    targetMemberId: "Tsonic.CSharp.Node.URL..ctor(System.String,System.String)",
    targetName: "URL",
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
  sourceMemberName: string,
  memberId: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
  options: { readonly static?: boolean } = {},
): NodeUrlClassCallTargetMember {
  return {
    exportName,
    memberName: sourceMemberName,
    memberId,
    signatureId,
    targetMemberId,
    targetName,
    memberKind: "method",
    providerParameters,
    providerReturnType,
    ...(options.static === true ? { static: true } : {}),
    member: {
      id: targetMemberId,
      sourceName: sourceMemberName,
      targetName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: urlTargetType,
      ...(options.static === true ? { static: true } : {}),
    },
  };
}

function urlClassProperty(
  sourceMemberName: string,
  memberId: string,
  targetMemberId: string,
  targetName: string,
  options: { readonly readonly?: true } = {},
): NodeUrlClassPropertyTargetMember {
  return {
    exportName: nodeUrlUrlExportName,
    memberName: sourceMemberName,
    memberId,
    targetMemberId,
    targetName,
    providerType: stringProviderType,
    ...(options.readonly === true ? { readonly: true } : {}),
    member: {
      id: targetMemberId,
      sourceName: sourceMemberName,
      targetName,
      kind: "property",
      parameters: [],
      returnType: stringTargetType,
      declaringType: urlTargetType,
    },
  };
}
