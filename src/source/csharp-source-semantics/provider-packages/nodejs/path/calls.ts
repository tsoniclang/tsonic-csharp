import type {
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../../surfaces/js/source-library.js";
import {
  nodejsModuleCallTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsModuleCallTargetMetadataRow,
} from "../members/target-member-metadata.js";
import {
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "../metadata-indexes.js";
import {
  nodePathJoinExportName,
  nodePathJoinSignatureId,
  nodePathModuleSpecifier,
} from "./identity.js";
import {
  boolProviderType,
  boolTargetType,
  nodePathTargetType,
  parsedPathProviderType,
  parsedPathTargetType,
  stringProviderType,
  stringTargetType,
} from "./types.js";
import type {
  NodePathCallTargetMember,
} from "./types.js";

type NodePathCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

export function getNodePathJoinTargetMember(): TargetMember {
  const member = getNodePathCallTargetMember(nodePathJoinExportName, nodePathJoinSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS path.join target member.");
  }
  return member;
}

export function getNodePathCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodePathCallTargetMemberByProviderDeclarationIdentity,
    nodePathModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function nodePathCallTargetMembers(): readonly NodePathCallTargetMember[] {
  const stringRestParameter = {
    name: "paths",
    type: { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression,
    rest: true,
  };
  const stringParameter = (name: string) => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string) => ({ name, type: stringProviderType, optional: true });
  return [
    pathCall({ exportName: "basename", signatureId: "node:path.basename(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.path.basename(System.String,System.String)", sourceName: "basename", targetName: "basename", providerParameters: [stringParameter("path"), optionalStringParameter("suffix")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("suffix", stringTargetType, { optional: true }),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "dirname", signatureId: "node:path.dirname(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.dirname(System.String)", sourceName: "dirname", targetName: "dirname", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "extname", signatureId: "node:path.extname(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.extname(System.String)", sourceName: "extname", targetName: "extname", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "isAbsolute", signatureId: "node:path.isAbsolute(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.isAbsolute(System.String)", sourceName: "isAbsolute", targetName: "isAbsolute", providerParameters: [stringParameter("path")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: boolTargetType }),
    pathCall({ exportName: nodePathJoinExportName, signatureId: nodePathJoinSignatureId, targetMemberId: "Tsonic.CSharp.Node.path.join(System.String[])", sourceName: "join", targetName: "join", providerParameters: [stringRestParameter], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "matchesGlob", signatureId: "node:path.matchesGlob(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.path.matchesGlob(System.String,System.String)", sourceName: "matchesGlob", targetName: "matchesGlob", providerParameters: [stringParameter("path"), stringParameter("pattern")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("pattern", stringTargetType),
    ], targetReturnType: boolTargetType }),
    pathCall({ exportName: "normalize", signatureId: "node:path.normalize(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.normalize(System.String)", sourceName: "normalize", targetName: "normalize", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "parse", signatureId: "node:path.parse(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.parse(System.String)", sourceName: "parse", targetName: "parse", providerParameters: [stringParameter("path")], providerReturnType: parsedPathProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: parsedPathTargetType }),
    pathCall({ exportName: "relative", signatureId: "node:path.relative(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.path.relative(System.String,System.String)", sourceName: "relative", targetName: "relative", providerParameters: [stringParameter("from"), stringParameter("to")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "resolve", signatureId: "node:path.resolve(System.String[])", targetMemberId: "Tsonic.CSharp.Node.path.resolve(System.String[])", sourceName: "resolve", targetName: "resolve", providerParameters: [stringRestParameter], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "toNamespacedPath", signatureId: "node:path.toNamespacedPath(System.String)", targetMemberId: "Tsonic.CSharp.Node.path.toNamespacedPath(System.String)", sourceName: "toNamespacedPath", targetName: "toNamespacedPath", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathCall({ exportName: "format", signatureId: "node:path.format(Tsonic.CSharp.Node.ParsedPath)", targetMemberId: "Tsonic.CSharp.Node.path.format(Tsonic.CSharp.Node.ParsedPath)", sourceName: "format", targetName: "format", providerParameters: [{ name: "pathObject", type: parsedPathProviderType }], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("pathObject", parsedPathTargetType),
    ], targetReturnType: stringTargetType }),
  ];
}

function pathCall(row: NodePathCallTargetMetadataRow): NodePathCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: nodePathTargetType,
  });
}

const nodePathCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodePathModuleSpecifier, nodePathCallTargetMembers());
