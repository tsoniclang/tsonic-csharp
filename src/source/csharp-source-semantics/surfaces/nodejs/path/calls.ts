import type {
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
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
  NodePathProviderParameter,
} from "./types.js";

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
    pathCall("basename", "node:path.basename(System.String,System.String)", "Tsonic.CSharp.Node.path.basename(System.String,System.String)", "basename", [stringParameter("path"), optionalStringParameter("suffix")], stringProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("suffix", stringTargetType, { optional: true }),
    ], stringTargetType),
    pathCall("dirname", "node:path.dirname(System.String)", "Tsonic.CSharp.Node.path.dirname(System.String)", "dirname", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("extname", "node:path.extname(System.String)", "Tsonic.CSharp.Node.path.extname(System.String)", "extname", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("isAbsolute", "node:path.isAbsolute(System.String)", "Tsonic.CSharp.Node.path.isAbsolute(System.String)", "isAbsolute", [stringParameter("path")], boolProviderType, [
      targetParameter("path", stringTargetType),
    ], boolTargetType),
    pathCall(nodePathJoinExportName, nodePathJoinSignatureId, "Tsonic.CSharp.Node.path.join(System.String[])", "join", [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("matchesGlob", "node:path.matchesGlob(System.String,System.String)", "Tsonic.CSharp.Node.path.matchesGlob(System.String,System.String)", "matchesGlob", [stringParameter("path"), stringParameter("pattern")], boolProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("pattern", stringTargetType),
    ], boolTargetType),
    pathCall("normalize", "node:path.normalize(System.String)", "Tsonic.CSharp.Node.path.normalize(System.String)", "normalize", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("parse", "node:path.parse(System.String)", "Tsonic.CSharp.Node.path.parse(System.String)", "parse", [stringParameter("path")], parsedPathProviderType, [
      targetParameter("path", stringTargetType),
    ], parsedPathTargetType),
    pathCall("relative", "node:path.relative(System.String,System.String)", "Tsonic.CSharp.Node.path.relative(System.String,System.String)", "relative", [stringParameter("from"), stringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    pathCall("resolve", "node:path.resolve(System.String[])", "Tsonic.CSharp.Node.path.resolve(System.String[])", "resolve", [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("toNamespacedPath", "node:path.toNamespacedPath(System.String)", "Tsonic.CSharp.Node.path.toNamespacedPath(System.String)", "toNamespacedPath", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("format", "node:path.format(Tsonic.CSharp.Node.ParsedPath)", "Tsonic.CSharp.Node.path.format(Tsonic.CSharp.Node.ParsedPath)", "format", [{ name: "pathObject", type: parsedPathProviderType }], stringProviderType, [
      targetParameter("pathObject", parsedPathTargetType),
    ], stringTargetType),
  ];
}

function pathCall(
  sourceName: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerParameters: readonly NodePathProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodePathCallTargetMember {
  return {
    exportName: sourceName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: nodePathTargetType,
      static: true,
    },
  };
}

const nodePathCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodePathModuleSpecifier, nodePathCallTargetMembers());
