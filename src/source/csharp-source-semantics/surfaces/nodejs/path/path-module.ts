import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
  nodejsClassCallTargetMetadata,
  nodejsClassPropertyTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsClassCallTargetMetadata,
  NodejsClassCallTargetMetadataRow,
  NodejsClassPropertyTargetMetadata,
  NodejsClassPropertyTargetMetadataRow,
} from "../members/target-member-metadata.js";
import {
  boolProviderType,
  boolTargetType,
  parsedPathProviderType,
  parsedPathTargetType,
  pathModuleProviderType,
  pathModuleTargetType,
  stringProviderType,
  stringTargetType,
} from "./types.js";

const nodePathPathModuleExportName = "PathModule";
const nodePathPathModuleMemberPrefix = "node:path.PathModule";
const nodePathPathModuleTargetPrefix = "Tsonic.CSharp.Node.PathModule";

type NodePathPathModuleCallTargetMetadataRow = Omit<NodejsClassCallTargetMetadataRow, "exportName" | "declaringType" | "memberKind">;
type NodePathPathModulePropertyTargetMetadataRow = Omit<NodejsClassPropertyTargetMetadataRow, "exportName" | "declaringType" | "memberKind">;

export function nodePathPathModuleExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:path.${nodePathPathModuleExportName}`,
    name: nodePathPathModuleExportName,
    kind: "interface",
    targetIdentity: {
      target: "csharp",
      id: pathModuleTargetType.id,
      displayName: "Tsonic.CSharp.Node.PathModule",
    },
    members: [
      ...nodePathPathModulePropertyTargetMembers().map(providerMemberForPathModuleProperty),
      ...nodePathPathModuleClassCallTargetMembers().map(providerMemberForPathModuleCall),
    ],
  };
}

export function nodePathPathModuleClassCallTargetMembers(): readonly NodejsClassCallTargetMetadata[] {
  const stringRestParameter = {
    name: "paths",
    type: { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression,
    rest: true,
  };
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType, optional: true });
  return [
    pathModuleCall({ memberName: "basename", memberId: `${nodePathPathModuleMemberPrefix}.basename`, signatureId: `${nodePathPathModuleMemberPrefix}.basename(System.String,System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.basename(System.String,System.String)`, sourceName: "basename", targetName: "basename", providerParameters: [stringParameter("path"), optionalStringParameter("suffix")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("suffix", stringTargetType, { optional: true }),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "dirname", memberId: `${nodePathPathModuleMemberPrefix}.dirname`, signatureId: `${nodePathPathModuleMemberPrefix}.dirname(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.dirname(System.String)`, sourceName: "dirname", targetName: "dirname", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "extname", memberId: `${nodePathPathModuleMemberPrefix}.extname`, signatureId: `${nodePathPathModuleMemberPrefix}.extname(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.extname(System.String)`, sourceName: "extname", targetName: "extname", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "isAbsolute", memberId: `${nodePathPathModuleMemberPrefix}.isAbsolute`, signatureId: `${nodePathPathModuleMemberPrefix}.isAbsolute(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.isAbsolute(System.String)`, sourceName: "isAbsolute", targetName: "isAbsolute", providerParameters: [stringParameter("path")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: boolTargetType }),
    pathModuleCall({ memberName: "join", memberId: `${nodePathPathModuleMemberPrefix}.join`, signatureId: `${nodePathPathModuleMemberPrefix}.join(System.String[])`, targetMemberId: `${nodePathPathModuleTargetPrefix}.join(System.String[])`, sourceName: "join", targetName: "join", providerParameters: [stringRestParameter], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "matchesGlob", memberId: `${nodePathPathModuleMemberPrefix}.matchesGlob`, signatureId: `${nodePathPathModuleMemberPrefix}.matchesGlob(System.String,System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.matchesGlob(System.String,System.String)`, sourceName: "matchesGlob", targetName: "matchesGlob", providerParameters: [stringParameter("path"), stringParameter("pattern")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("pattern", stringTargetType),
    ], targetReturnType: boolTargetType }),
    pathModuleCall({ memberName: "normalize", memberId: `${nodePathPathModuleMemberPrefix}.normalize`, signatureId: `${nodePathPathModuleMemberPrefix}.normalize(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.normalize(System.String)`, sourceName: "normalize", targetName: "normalize", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "parse", memberId: `${nodePathPathModuleMemberPrefix}.parse`, signatureId: `${nodePathPathModuleMemberPrefix}.parse(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.parse(System.String)`, sourceName: "parse", targetName: "parse", providerParameters: [stringParameter("path")], providerReturnType: parsedPathProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: parsedPathTargetType }),
    pathModuleCall({ memberName: "relative", memberId: `${nodePathPathModuleMemberPrefix}.relative`, signatureId: `${nodePathPathModuleMemberPrefix}.relative(System.String,System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.relative(System.String,System.String)`, sourceName: "relative", targetName: "relative", providerParameters: [stringParameter("from"), stringParameter("to")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "resolve", memberId: `${nodePathPathModuleMemberPrefix}.resolve`, signatureId: `${nodePathPathModuleMemberPrefix}.resolve(System.String[])`, targetMemberId: `${nodePathPathModuleTargetPrefix}.resolve(System.String[])`, sourceName: "resolve", targetName: "resolve", providerParameters: [stringRestParameter], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "toNamespacedPath", memberId: `${nodePathPathModuleMemberPrefix}.toNamespacedPath`, signatureId: `${nodePathPathModuleMemberPrefix}.toNamespacedPath(System.String)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.toNamespacedPath(System.String)`, sourceName: "toNamespacedPath", targetName: "toNamespacedPath", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    pathModuleCall({ memberName: "format", memberId: `${nodePathPathModuleMemberPrefix}.format`, signatureId: `${nodePathPathModuleMemberPrefix}.format(Tsonic.CSharp.Node.ParsedPath)`, targetMemberId: `${nodePathPathModuleTargetPrefix}.format(Tsonic.CSharp.Node.ParsedPath)`, sourceName: "format", targetName: "format", providerParameters: [{ name: "pathObject", type: parsedPathProviderType }], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("pathObject", parsedPathTargetType),
    ], targetReturnType: stringTargetType }),
  ];
}

export function nodePathPathModulePropertyTargetMembers(): readonly NodejsClassPropertyTargetMetadata[] {
  return [
    pathModuleProperty({ memberName: "sep", memberId: `${nodePathPathModuleMemberPrefix}.sep`, targetMemberId: `${nodePathPathModuleTargetPrefix}.sep`, sourceName: "sep", targetName: "sep", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType, readonly: true }),
    pathModuleProperty({ memberName: "delimiter", memberId: `${nodePathPathModuleMemberPrefix}.delimiter`, targetMemberId: `${nodePathPathModuleTargetPrefix}.delimiter`, sourceName: "delimiter", targetName: "delimiter", providerType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType, readonly: true }),
    pathModuleProperty({ memberName: "posix", memberId: `${nodePathPathModuleMemberPrefix}.posix`, targetMemberId: `${nodePathPathModuleTargetPrefix}.posix`, sourceName: "posix", targetName: "posix", providerType: pathModuleProviderType, targetParameters: [], targetReturnType: pathModuleTargetType, readonly: true }),
    pathModuleProperty({ memberName: "win32", memberId: `${nodePathPathModuleMemberPrefix}.win32`, targetMemberId: `${nodePathPathModuleTargetPrefix}.win32`, sourceName: "win32", targetName: "win32", providerType: pathModuleProviderType, targetParameters: [], targetReturnType: pathModuleTargetType, readonly: true }),
  ];
}

function providerMemberForPathModuleCall(member: NodejsClassCallTargetMetadata): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: "method",
    signatures: [{
      id: member.signatureId,
      parameters: member.providerParameters,
      returnType: member.providerReturnType ?? stringProviderType,
    }],
  };
}

function providerMemberForPathModuleProperty(member: NodejsClassPropertyTargetMetadata): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: "property",
    readonly: true,
    type: member.providerType,
  };
}

function pathModuleCall(row: NodePathPathModuleCallTargetMetadataRow): NodejsClassCallTargetMetadata {
  return nodejsClassCallTargetMetadata({
    ...row,
    exportName: nodePathPathModuleExportName,
    memberKind: "method",
    declaringType: pathModuleTargetType,
  });
}

function pathModuleProperty(row: NodePathPathModulePropertyTargetMetadataRow): NodejsClassPropertyTargetMetadata {
  return nodejsClassPropertyTargetMetadata({
    ...row,
    exportName: nodePathPathModuleExportName,
    memberKind: "property",
    declaringType: pathModuleTargetType,
  });
}
