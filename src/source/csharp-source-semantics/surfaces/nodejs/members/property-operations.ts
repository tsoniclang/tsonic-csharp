import type {
  TargetOperationFact,
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
  getNodejsPropertyTargetMemberFromMetadata,
} from "./metadata-index.js";

export function getCsharpNodejsPropertyOperation(
  declaration: NodejsProviderDeclarationIdentity,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const member = getNodejsPropertyTargetMemberFromMetadata(declaration);
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
