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
    pathProperty("sep", "Tsonic.CSharp.Node.path.sep", "sep", stringProviderType, stringTargetType),
    pathProperty("delimiter", "Tsonic.CSharp.Node.path.delimiter", "delimiter", stringProviderType, stringTargetType),
  ];
}

function pathProperty(
  sourceName: string,
  targetMemberId: string,
  targetName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodePathPropertyTargetMember {
  return {
    exportName: sourceName,
    providerType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
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
