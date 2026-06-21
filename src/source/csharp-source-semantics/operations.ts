import type {
  CheckedOperationMappingResult,
  ExtensionFactSubject,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpStaticMemberOperation,
} from "../csharp-operation-tags.js";

export function targetOperation(
  operationId: string,
  operationKind: "property" | "method" | "indexer" | "operator" | "constructor" | "iteration",
  targetOperation: string,
  options: { readonly resultType?: ExtensionFactSubject } = {},
): CheckedOperationMappingResult["operation"] {
  return {
    operationId,
    operationKind,
    targetOperation,
    ...(options.resultType !== undefined ? { resultType: options.resultType } : {}),
  };
}

export function targetOperationFromMember(member: TargetMember): CheckedOperationMappingResult["operation"] {
  return {
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    targetOperation: member.static === true && member.declaringType?.kind === "target-named"
      ? csharpStaticMemberOperation(member.declaringType.id, member.targetName)
      : member.targetName,
  };
}
