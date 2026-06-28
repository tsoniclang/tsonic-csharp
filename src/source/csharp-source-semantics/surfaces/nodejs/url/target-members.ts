import type {
  ProviderParameterDeclaration,
  TargetParameter,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
  nodejsClassCallTargetMetadata,
  nodejsClassPropertyTargetMetadata,
  nodejsModuleCallTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsClassCallTargetMetadataRow,
  NodejsClassPropertyTargetMetadataRow,
  NodejsModuleCallTargetMetadataRow,
} from "../members/target-member-metadata.js";
import {
  nodeUrlFileUrlToPathExportName,
  nodeUrlFileUrlToPathStringSignatureId,
  nodeUrlFileUrlToPathUrlSignatureId,
  nodeUrlPathToFileUrlExportName,
  nodeUrlPathToFileUrlSignatureId,
  nodeUrlUrlCanParseMemberId,
  nodeUrlUrlCanParseSignatureId,
  nodeUrlUrlCanParseUrlSignatureId,
  nodeUrlUrlConstructorMemberId,
  nodeUrlUrlConstructorSignatureId,
  nodeUrlUrlConstructorUrlSignatureId,
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
  objectTargetType,
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

type NodeUrlModuleCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;
type NodeUrlClassCallTargetMetadataRow = Omit<NodejsClassCallTargetMetadataRow, "declaringType">;
type NodeUrlClassPropertyTargetMetadataRow = Omit<NodejsClassPropertyTargetMetadataRow, "declaringType">;

export function nodeUrlCallTargetMembers(): readonly NodeUrlCallTargetMember[] {
  return [
    urlModuleCall({ exportName: "domainToASCII", signatureId: "node:url.domainToASCII(System.String)", targetMemberId: "Tsonic.CSharp.Node.url.domainToASCII(System.String)", sourceName: "domainToASCII", targetName: "domainToASCII", providerParameters: [nodeUrlStringParameter("domain")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("domain", stringTargetType),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: "domainToUnicode", signatureId: "node:url.domainToUnicode(System.String)", targetMemberId: "Tsonic.CSharp.Node.url.domainToUnicode(System.String)", sourceName: "domainToUnicode", targetName: "domainToUnicode", providerParameters: [nodeUrlStringParameter("domain")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("domain", stringTargetType),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: "format", signatureId: "node:url.format(Tsonic.CSharp.Node.URL)", targetMemberId: "Tsonic.CSharp.Node.url.format(System.Object)", sourceName: "format", targetName: "format", providerParameters: [nodeUrlUrlParameter("urlObject")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("urlObject", objectTargetType, { csharpAcceptsClosedSourceArgument: true }),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: "parse", signatureId: "node:url.parse(System.String)", targetMemberId: "Tsonic.CSharp.Node.url.parse(System.String)", sourceName: "parse", targetName: "parse", providerParameters: [nodeUrlStringParameter("input")], providerReturnType: nullableUrlProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
    ], targetReturnType: nullableUrlTargetType }),
    urlModuleCall({ exportName: "resolve", signatureId: "node:url.resolve(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.url.resolve(System.String,System.String)", sourceName: "resolve", targetName: "resolve", providerParameters: [nodeUrlStringParameter("from"), nodeUrlStringParameter("to")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: nodeUrlPathToFileUrlExportName, signatureId: nodeUrlPathToFileUrlSignatureId, targetMemberId: "Tsonic.CSharp.Node.url.pathToFileURL(System.String)", sourceName: "pathToFileURL", targetName: "pathToFileURL", providerParameters: [nodeUrlStringParameter("filePath")], providerReturnType: urlProviderType, targetParameters: [
      targetParameter("filePath", stringTargetType),
    ], targetReturnType: urlTargetType }),
    urlModuleCall({ exportName: nodeUrlFileUrlToPathExportName, signatureId: nodeUrlFileUrlToPathStringSignatureId, targetMemberId: "Tsonic.CSharp.Node.url.fileURLToPath(System.String)", sourceName: "fileURLToPath", targetName: "fileURLToPath", providerParameters: [nodeUrlStringParameter("fileUrl")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("fileUrl", stringTargetType),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: nodeUrlFileUrlToPathExportName, signatureId: nodeUrlFileUrlToPathUrlSignatureId, targetMemberId: "Tsonic.CSharp.Node.url.fileURLToPath(Tsonic.CSharp.Node.URL)", sourceName: "fileURLToPath", targetName: "fileURLToPath", providerParameters: [nodeUrlUrlParameter("fileUrl")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("fileUrl", urlTargetType),
    ], targetReturnType: stringTargetType }),
    urlModuleCall({ exportName: "fileURLToPathBuffer", signatureId: "node:url.fileURLToPathBuffer(System.String)", targetMemberId: "Tsonic.CSharp.Node.url.fileURLToPathBuffer(System.String)", sourceName: "fileURLToPathBuffer", targetName: "fileURLToPathBuffer", providerParameters: [nodeUrlStringParameter("fileUrl")], providerReturnType: bufferProviderType, targetParameters: [
      targetParameter("fileUrl", stringTargetType),
    ], targetReturnType: bufferTargetType }),
    urlModuleCall({ exportName: "fileURLToPathBuffer", signatureId: "node:url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", targetMemberId: "Tsonic.CSharp.Node.url.fileURLToPathBuffer(Tsonic.CSharp.Node.URL)", sourceName: "fileURLToPathBuffer", targetName: "fileURLToPathBuffer", providerParameters: [nodeUrlUrlParameter("fileUrl")], providerReturnType: bufferProviderType, targetParameters: [
      targetParameter("fileUrl", urlTargetType),
    ], targetReturnType: bufferTargetType }),
  ];
}

export function nodeUrlClassCallTargetMembers(): readonly NodeUrlClassCallTargetMember[] {
  return [
    urlClassConstructor([nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ]),
    urlClassConstructorWithIdentity(nodeUrlUrlConstructorUrlSignatureId, "Tsonic.CSharp.Node.URL..ctor(System.String,Tsonic.CSharp.Node.URL)", [nodeUrlStringParameter("input"), nodeUrlUrlParameter("base")], [
      targetParameter("input", stringTargetType),
      targetParameter("base", urlTargetType),
    ]),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "canParse", memberId: nodeUrlUrlCanParseMemberId, signatureId: nodeUrlUrlCanParseSignatureId, targetMemberId: "Tsonic.CSharp.Node.URL.canParse(System.String,System.String)", sourceName: "canParse", targetName: "canParse", memberKind: "method", providerParameters: [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], targetReturnType: boolTargetType, static: true }),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "canParse", memberId: nodeUrlUrlCanParseMemberId, signatureId: nodeUrlUrlCanParseUrlSignatureId, targetMemberId: "Tsonic.CSharp.Node.URL.canParse(System.String,Tsonic.CSharp.Node.URL)", sourceName: "canParse", targetName: "canParse", memberKind: "method", providerParameters: [nodeUrlStringParameter("input"), nodeUrlUrlParameter("base")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
      targetParameter("base", urlTargetType),
    ], targetReturnType: boolTargetType, static: true }),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "parse", memberId: "node:url.URL.parse", signatureId: "node:url.URL.parse(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.URL.parse(System.String,System.String)", sourceName: "parse", targetName: "parse", memberKind: "method", providerParameters: [nodeUrlStringParameter("input"), nodeUrlOptionalStringParameter("base")], providerReturnType: nullableUrlProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
      targetParameter("base", stringTargetType, { optional: true }),
    ], targetReturnType: nullableUrlTargetType, static: true }),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "parse", memberId: "node:url.URL.parse", signatureId: "node:url.URL.parse(System.String,Tsonic.CSharp.Node.URL)", targetMemberId: "Tsonic.CSharp.Node.URL.parse(System.String,Tsonic.CSharp.Node.URL)", sourceName: "parse", targetName: "parse", memberKind: "method", providerParameters: [nodeUrlStringParameter("input"), nodeUrlUrlParameter("base")], providerReturnType: nullableUrlProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
      targetParameter("base", urlTargetType),
    ], targetReturnType: nullableUrlTargetType, static: true }),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "toString", memberId: "node:url.URL.toString", signatureId: "node:url.URL.toString()", targetMemberId: "Tsonic.CSharp.Node.URL.ToString()", sourceName: "toString", targetName: "ToString", memberKind: "method", providerParameters: [], providerReturnType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassMethod({ exportName: nodeUrlUrlExportName, memberName: "toJSON", memberId: "node:url.URL.toJSON", signatureId: "node:url.URL.toJSON()", targetMemberId: "Tsonic.CSharp.Node.URL.toJSON()", sourceName: "toJSON", targetName: "toJSON", memberKind: "method", providerParameters: [], providerReturnType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
  ];
}

export function nodeUrlClassPropertyTargetMembers(): readonly NodeUrlClassPropertyTargetMember[] {
  return [
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "href", memberId: nodeUrlUrlHrefMemberId, targetMemberId: "Tsonic.CSharp.Node.URL.href", sourceName: "href", targetName: "href", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "protocol", memberId: "node:url.URL.protocol", targetMemberId: "Tsonic.CSharp.Node.URL.protocol", sourceName: "protocol", targetName: "protocol", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "username", memberId: "node:url.URL.username", targetMemberId: "Tsonic.CSharp.Node.URL.username", sourceName: "username", targetName: "username", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "password", memberId: "node:url.URL.password", targetMemberId: "Tsonic.CSharp.Node.URL.password", sourceName: "password", targetName: "password", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "host", memberId: "node:url.URL.host", targetMemberId: "Tsonic.CSharp.Node.URL.host", sourceName: "host", targetName: "host", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "hostname", memberId: "node:url.URL.hostname", targetMemberId: "Tsonic.CSharp.Node.URL.hostname", sourceName: "hostname", targetName: "hostname", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "port", memberId: "node:url.URL.port", targetMemberId: "Tsonic.CSharp.Node.URL.port", sourceName: "port", targetName: "port", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "pathname", memberId: "node:url.URL.pathname", targetMemberId: "Tsonic.CSharp.Node.URL.pathname", sourceName: "pathname", targetName: "pathname", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "search", memberId: "node:url.URL.search", targetMemberId: "Tsonic.CSharp.Node.URL.search", sourceName: "search", targetName: "search", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "hash", memberId: "node:url.URL.hash", targetMemberId: "Tsonic.CSharp.Node.URL.hash", sourceName: "hash", targetName: "hash", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    urlClassProperty({ exportName: nodeUrlUrlExportName, memberName: "origin", memberId: "node:url.URL.origin", targetMemberId: "Tsonic.CSharp.Node.URL.origin", sourceName: "origin", targetName: "origin", memberKind: "property", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType, readonly: true }),
  ];
}

function urlModuleCall(row: NodeUrlModuleCallTargetMetadataRow): NodeUrlCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: urlModuleTargetType,
  });
}

function urlClassConstructor(
  providerParameters: readonly ProviderParameterDeclaration[],
  targetParameters: readonly TargetParameter[],
): NodeUrlClassCallTargetMember {
  return urlClassConstructorWithIdentity(
    nodeUrlUrlConstructorSignatureId,
    "Tsonic.CSharp.Node.URL..ctor(System.String,System.String)",
    providerParameters,
    targetParameters,
  );
}

function urlClassConstructorWithIdentity(
  signatureId: string,
  targetMemberId: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  targetParameters: readonly TargetParameter[],
): NodeUrlClassCallTargetMember {
  return nodejsClassCallTargetMetadata({
    exportName: nodeUrlUrlExportName,
    memberName: "constructor",
    memberId: nodeUrlUrlConstructorMemberId,
    signatureId,
    targetMemberId,
    sourceName: "constructor",
    targetName: "URL",
    memberKind: "constructor",
    providerParameters,
    targetParameters,
    targetReturnType: urlTargetType,
    declaringType: urlTargetType,
  });
}

function urlClassMethod(row: NodeUrlClassCallTargetMetadataRow): NodeUrlClassCallTargetMember {
  return nodejsClassCallTargetMetadata({
    ...row,
    declaringType: urlTargetType,
  });
}

function urlClassProperty(row: NodeUrlClassPropertyTargetMetadataRow): NodeUrlClassPropertyTargetMember {
  return nodejsClassPropertyTargetMetadata({
    ...row,
    declaringType: urlTargetType,
  });
}
