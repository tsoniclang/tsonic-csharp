import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpReceiverCallPropertyEmission } from "../../target-model/records/calls/receiver-call-property.js";
import { createCsharpReceiverCallPropertyRecords } from "../program/records/calls/receiver-call-property.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function analyzeCsharpReceiverCallProperties(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpReceiverCallPropertyEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    if (!admitted(node)) continue;
    const selection = operations.selectedProperty.get(node)?.selection;
    if (selection?.kind !== "resolved" || selection.invocation.kind !== "receiver-call") continue;
    const member = selection.targetMember;
    const call = selection.invocation.call;
    if (member.kind !== "property" || member.readonly !== true || member.returnType === undefined || member.declaringType === undefined ||
      member.parameters.length !== 0 || call.kind !== "method" || call.static === true || call.declaringType === undefined ||
      call.parameters.length !== 0 || (call.typeParameters?.length ?? 0) !== 0 || call.returnType === undefined ||
      !targetTypeRefEquals(call.returnType, member.declaringType) || selection.receiver.kind !== "instance" || selection.source.accessMode !== "read") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "A computed native property requires its exact readonly member and instance receiver-call relation." });
      continue;
    }
    values.set(node, { selection });
  }
  return Object.freeze({ records: createCsharpReceiverCallPropertyRecords(values), issues: Object.freeze(issues) });
}
