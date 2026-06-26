import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import {
  getNodejsCallTargetMemberFromMetadata,
} from "./metadata-index.js";
import type {
  TargetMember,
} from "@tsonic/tsts";

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  return getNodejsCallTargetMemberFromMetadata(declaration);
}
