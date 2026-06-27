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
