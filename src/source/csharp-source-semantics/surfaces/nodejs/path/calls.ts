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
    pathCall("basename", "node:path.basename(System.String,System.String)", [stringParameter("path"), optionalStringParameter("suffix")], stringProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("suffix", stringTargetType, { optional: true }),
    ], stringTargetType),
    pathCall("dirname", "node:path.dirname(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("extname", "node:path.extname(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("isAbsolute", "node:path.isAbsolute(System.String)", [stringParameter("path")], boolProviderType, [
      targetParameter("path", stringTargetType),
    ], boolTargetType),
    pathCall(nodePathJoinExportName, nodePathJoinSignatureId, [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("matchesGlob", "node:path.matchesGlob(System.String,System.String)", [stringParameter("path"), stringParameter("pattern")], boolProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("pattern", stringTargetType),
    ], boolTargetType),
    pathCall("normalize", "node:path.normalize(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("parse", "node:path.parse(System.String)", [stringParameter("path")], parsedPathProviderType, [
      targetParameter("path", stringTargetType),
    ], parsedPathTargetType),
    pathCall("relative", "node:path.relative(System.String,System.String)", [stringParameter("from"), stringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    pathCall("resolve", "node:path.resolve(System.String[])", [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("toNamespacedPath", "node:path.toNamespacedPath(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("format", "node:path.format(Tsonic.CSharp.Node.ParsedPath)", [{ name: "pathObject", type: parsedPathProviderType }], stringProviderType, [
      targetParameter("pathObject", parsedPathTargetType),
    ], stringTargetType),
  ];
}

function pathCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly NodePathProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodePathCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: {
      id: `Tsonic.CSharp.Node.path.${exportName}(${signatureId.slice("node:path.".length + exportName.length + 1, -1)})`,
      sourceName: exportName,
      targetName: exportName,
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
