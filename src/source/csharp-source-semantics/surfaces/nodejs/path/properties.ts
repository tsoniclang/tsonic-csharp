import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  getNodejsProviderExportDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
} from "../metadata-indexes.js";
import {
  nodejsModulePropertyTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsModulePropertyTargetMetadataRow,
} from "../members/target-member-metadata.js";
import {
  nodePathModuleSpecifier,
} from "./identity.js";
import {
  nodePathTargetType,
  pathModuleProviderType,
  pathModuleTargetType,
  stringProviderType,
  stringTargetType,
} from "./types.js";
import type {
  NodePathPropertyTargetMember,
} from "./types.js";

type NodePathPropertyTargetMetadataRow = Omit<NodejsModulePropertyTargetMetadataRow, "declaringType">;

export function getNodePathPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return getNodejsProviderExportDeclarationTargetMember(
    nodePathPropertyTargetMemberByProviderDeclarationIdentity,
    nodePathModuleSpecifier,
    exportName,
  );
}

export function nodePathPropertyTargetMembers(): readonly NodePathPropertyTargetMember[] {
  return [
    pathProperty({ exportName: "sep", targetMemberId: "Tsonic.CSharp.Node.path.sep", sourceName: "sep", targetName: "sep", providerType: stringProviderType, targetReturnType: stringTargetType }),
    pathProperty({ exportName: "delimiter", targetMemberId: "Tsonic.CSharp.Node.path.delimiter", sourceName: "delimiter", targetName: "delimiter", providerType: stringProviderType, targetReturnType: stringTargetType }),
    pathProperty({ exportName: "posix", targetMemberId: "Tsonic.CSharp.Node.path.posix", sourceName: "posix", targetName: "posix", providerType: pathModuleProviderType, targetReturnType: pathModuleTargetType }),
    pathProperty({ exportName: "win32", targetMemberId: "Tsonic.CSharp.Node.path.win32", sourceName: "win32", targetName: "win32", providerType: pathModuleProviderType, targetReturnType: pathModuleTargetType }),
  ];
}

function pathProperty(row: NodePathPropertyTargetMetadataRow): NodePathPropertyTargetMember {
  return nodejsModulePropertyTargetMetadata({
    ...row,
    declaringType: nodePathTargetType,
  });
}

const nodePathPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodePathModuleSpecifier, nodePathPropertyTargetMembers());
