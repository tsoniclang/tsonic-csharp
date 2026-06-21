import type {
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import {
  csharpStaticMemberOperation,
} from "../../../csharp-operation-tags.js";
import {
  getNodeCryptoTargetMembers,
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  getNodeFsTargetMembers,
  nodeFsModuleSpecifier,
} from "./filesystem.js";
import {
  getNodeOsPropertyMembers,
  getNodeOsTargetMembers,
  nodeOsModuleSpecifier,
} from "./os.js";
import {
  getNodePathPropertyMembers,
  getNodePathTargetMembers,
  nodePathModuleSpecifier,
} from "./path.js";
import {
  getNodeProcessPropertyMembers,
  getNodeProcessTargetMembers,
  nodeProcessModuleSpecifier,
} from "./process.js";

export function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return moduleSpecifier === nodePathModuleSpecifier ||
    moduleSpecifier === nodeFsModuleSpecifier ||
    moduleSpecifier === nodeCryptoModuleSpecifier ||
    moduleSpecifier === nodeOsModuleSpecifier ||
    moduleSpecifier === nodeProcessModuleSpecifier;
}

export function getNodejsCallTargetMembers(moduleSpecifier: string, exportName: string): readonly TargetMember[] {
  switch (moduleSpecifier) {
    case nodePathModuleSpecifier:
      return getNodePathTargetMembers(exportName);
    case nodeFsModuleSpecifier:
      return getNodeFsTargetMembers(exportName);
    case nodeCryptoModuleSpecifier:
      return getNodeCryptoTargetMembers(exportName);
    case nodeOsModuleSpecifier:
      return getNodeOsTargetMembers(exportName);
    case nodeProcessModuleSpecifier:
      return getNodeProcessTargetMembers(exportName);
    default:
      return [];
  }
}

export function getCsharpNodejsStaticPropertyOperation(
  moduleSpecifier: string,
  exportName: string,
): TargetOperationFact | undefined {
  const member = selectSingleTargetMember(getNodejsPropertyTargetMembers(moduleSpecifier, exportName));
  return member === undefined
    ? undefined
    : {
        operationId: member.id,
        operationKind: "property",
        targetOperation: getStaticTargetOperation(member),
        ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
      };
}

export function selectSingleTargetMember(candidates: readonly TargetMember[]): TargetMember | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

function getNodejsPropertyTargetMembers(moduleSpecifier: string, exportName: string): readonly TargetMember[] {
  switch (moduleSpecifier) {
    case nodePathModuleSpecifier:
      return getNodePathPropertyMembers(exportName);
    case nodeOsModuleSpecifier:
      return getNodeOsPropertyMembers(exportName);
    case nodeProcessModuleSpecifier:
      return getNodeProcessPropertyMembers(exportName);
    default:
      return [];
  }
}

function getStaticTargetOperation(member: TargetMember): string {
  return member.declaringType?.kind === "target-named"
    ? csharpStaticMemberOperation(member.declaringType.id, member.targetName)
    : member.targetName;
}
