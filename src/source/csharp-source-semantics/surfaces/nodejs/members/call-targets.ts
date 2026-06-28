import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import {
  getNodejsCallTargetMemberFromMetadata,
} from "./metadata-index.js";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): CsharpTargetMember | undefined {
  return getNodejsCallTargetMemberFromMetadata(declaration);
}
