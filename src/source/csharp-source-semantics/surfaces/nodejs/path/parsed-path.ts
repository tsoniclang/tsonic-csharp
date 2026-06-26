import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
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
  return [
    nodePathParsedPathTargetMember("root", nodePathParsedPathRootMemberId, getNodePathParsedPathTargetMember("root", "root")),
    nodePathParsedPathTargetMember("dir", nodePathParsedPathDirMemberId, getNodePathParsedPathTargetMember("dir", "dir")),
    nodePathParsedPathTargetMember("base", nodePathParsedPathBaseMemberId, getNodePathParsedPathTargetMember("base", "@base")),
    nodePathParsedPathTargetMember("ext", nodePathParsedPathExtMemberId, getNodePathParsedPathTargetMember("ext", "ext")),
    nodePathParsedPathTargetMember("name", nodePathParsedPathNameMemberId, getNodePathParsedPathTargetMember("name", "name")),
  ];
}

export function nodePathParsedPathExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:path.${nodePathParsedPathExportName}`,
    name: nodePathParsedPathExportName,
    kind: "interface",
    members: [
      parsedPathProperty(nodePathParsedPathRootMemberId, "root"),
      parsedPathProperty(nodePathParsedPathDirMemberId, "dir"),
      parsedPathProperty(nodePathParsedPathBaseMemberId, "base"),
      parsedPathProperty(nodePathParsedPathExtMemberId, "ext"),
      parsedPathProperty(nodePathParsedPathNameMemberId, "name"),
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

function getNodePathParsedPathTargetMember(sourceName: string, targetName: string): TargetMember {
  return {
    id: `Tsonic.CSharp.Node.ParsedPath.${targetName}`,
    sourceName,
    targetName,
    kind: "property",
    parameters: [],
    returnType: stringTargetType,
    declaringType: parsedPathTargetType,
  };
}

function nodePathParsedPathTargetMember(
  memberName: string,
  memberId: string,
  member: TargetMember,
): NodejsClassPropertyTargetMember {
  return {
    exportName: nodePathParsedPathExportName,
    memberName,
    memberId,
    member,
  };
}
