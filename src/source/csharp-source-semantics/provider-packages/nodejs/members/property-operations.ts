import type {
  TargetOperationFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../../../../csharp-facts.js";
import {
  csharpTargetOperationFromMember,
  targetOperation,
  targetOperationFromMember,
} from "../../../operations.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import {
  getNodejsIndexerTargetMemberFromReceiverTypeMetadata,
  getNodejsPropertyTargetMemberFromMetadata,
} from "./metadata-index.js";

export function getCsharpNodejsPropertyOperation(
  declaration: NodejsProviderDeclarationIdentity,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const member = getNodejsPropertyTargetMemberFromMetadata(declaration);
  return operationFromNodejsTargetMember(member);
}

export function getCsharpNodejsElementOperationForReceiverType(
  receiverType: TargetTypeRef | undefined,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  return operationFromNodejsTargetMember(getNodejsIndexerTargetMemberFromReceiverTypeMetadata(receiverType));
}

function operationFromNodejsTargetMember(
  member: ReturnType<typeof getNodejsPropertyTargetMemberFromMetadata>,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  return member === undefined
    ? undefined
    : {
        operation: member.returnType === undefined
          ? targetOperationFromMember(member)
          : targetOperation(member.id, member.kind === "field" || member.kind === "event" ? "property" : member.kind, member.targetName, {
              resultType: member.returnType,
            }),
        csharpOperation: csharpTargetOperationFromMember(member),
      };
}
