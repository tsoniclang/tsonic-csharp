import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  nodejsClassPropertyTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsClassPropertyTargetMetadataRow,
} from "../members/target-member-metadata.js";
import type {
  NodejsClassPropertyTargetMember,
} from "../members/types.js";
import {
  nodePathParsedPathBaseMemberId,
  nodePathParsedPathDirMemberId,
  nodePathParsedPathExportName,
  nodePathParsedPathExtMemberId,
  nodePathParsedPathNameMemberId,
  nodePathParsedPathRootMemberId,
} from "./identity.js";
import {
  parsedPathTargetType,
  stringProviderType,
  stringTargetType,
} from "./types.js";

export function nodePathClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return nodePathParsedPathTargetMetadataRows.map(nodejsClassPropertyTargetMetadata);
}

export function nodePathParsedPathExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:path.${nodePathParsedPathExportName}`,
    name: nodePathParsedPathExportName,
    kind: "interface",
    members: [
      ...nodePathParsedPathTargetMetadataRows.map(({ memberId, memberName }) => parsedPathProperty(memberId, memberName)),
    ],
  };
}

function parsedPathProperty(id: string, name: string): {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
} {
  return {
    id,
    name,
    kind: "property",
    readonly: true,
    type: stringProviderType,
  };
}

const nodePathParsedPathTargetMetadataRows = [
  {
    exportName: nodePathParsedPathExportName,
    memberName: "root",
    memberId: nodePathParsedPathRootMemberId,
    targetMemberId: "Tsonic.CSharp.Node.ParsedPath.root",
    sourceName: "root",
    targetName: "root",
    memberKind: "property",
    providerType: stringProviderType,
    targetParameters: [],
    targetReturnType: stringTargetType,
    declaringType: parsedPathTargetType,
  },
  {
    exportName: nodePathParsedPathExportName,
    memberName: "dir",
    memberId: nodePathParsedPathDirMemberId,
    targetMemberId: "Tsonic.CSharp.Node.ParsedPath.dir",
    sourceName: "dir",
    targetName: "dir",
    memberKind: "property",
    providerType: stringProviderType,
    targetParameters: [],
    targetReturnType: stringTargetType,
    declaringType: parsedPathTargetType,
  },
  {
    exportName: nodePathParsedPathExportName,
    memberName: "base",
    memberId: nodePathParsedPathBaseMemberId,
    targetMemberId: "Tsonic.CSharp.Node.ParsedPath.@base",
    sourceName: "base",
    targetName: "@base",
    memberKind: "property",
    providerType: stringProviderType,
    targetParameters: [],
    targetReturnType: stringTargetType,
    declaringType: parsedPathTargetType,
  },
  {
    exportName: nodePathParsedPathExportName,
    memberName: "ext",
    memberId: nodePathParsedPathExtMemberId,
    targetMemberId: "Tsonic.CSharp.Node.ParsedPath.ext",
    sourceName: "ext",
    targetName: "ext",
    memberKind: "property",
    providerType: stringProviderType,
    targetParameters: [],
    targetReturnType: stringTargetType,
    declaringType: parsedPathTargetType,
  },
  {
    exportName: nodePathParsedPathExportName,
    memberName: "name",
    memberId: nodePathParsedPathNameMemberId,
    targetMemberId: "Tsonic.CSharp.Node.ParsedPath.name",
    sourceName: "name",
    targetName: "name",
    memberKind: "property",
    providerType: stringProviderType,
    targetParameters: [],
    targetReturnType: stringTargetType,
    declaringType: parsedPathTargetType,
  },
] satisfies readonly NodejsClassPropertyTargetMetadataRow[];
