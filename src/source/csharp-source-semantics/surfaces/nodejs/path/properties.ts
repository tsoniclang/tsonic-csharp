import type {
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getNodejsProviderExportDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
} from "../metadata-indexes.js";
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

export function getNodePathPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return getNodejsProviderExportDeclarationTargetMember(
    nodePathPropertyTargetMemberByProviderDeclarationIdentity,
    nodePathModuleSpecifier,
    exportName,
  );
}

export function nodePathPropertyTargetMembers(): readonly NodePathPropertyTargetMember[] {
  return [
    pathProperty("sep", stringProviderType, stringTargetType),
    pathProperty("delimiter", stringProviderType, stringTargetType),
  ];
}

function pathProperty(
  exportName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodePathPropertyTargetMember {
  return {
    exportName,
    providerType,
    member: {
      id: `Tsonic.CSharp.Node.path.${exportName}`,
      sourceName: exportName,
      targetName: exportName,
      kind: "property",
      parameters: [],
      returnType: targetType,
      declaringType: nodePathTargetType,
      static: true,
    },
  };
}

const nodePathPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodePathModuleSpecifier, nodePathPropertyTargetMembers());
