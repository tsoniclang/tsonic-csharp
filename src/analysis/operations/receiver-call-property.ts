import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpReceiverCallPropertyEmission } from "../../target-model/records/calls/receiver-call-property.js";
import { createCsharpReceiverCallPropertyRecords } from "../program/records/calls/receiver-call-property.js";

export function analyzeCsharpReceiverCallProperties(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpReceiverCallPropertyEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    if (!admitted(node)) continue;
    const selection = operations.selectedProperty.get(node)?.selection;
    if (selection?.kind !== "resolved" || selection.invocation.kind !== "receiver-call") continue;
    const member = selection.targetMember;
    const parameter = member.parameters[0];
    if (member.kind !== "method" || member.static !== true || (member.typeParameters?.length ?? 0) !== 0 || member.returnType === undefined ||
      member.declaringType === undefined || member.parameters.length !== 1 || parameter?.passingMode !== "by-value" || parameter.optional === true ||
      parameter.paramsArray === true || selection.receiver.kind !== "target-parameter" || selection.receiver.targetParameterIndex !== 0 || selection.source.accessMode !== "read") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "A computed native property requires its exact read-only static receiver-call relation." });
      continue;
    }
    values.set(node, { selection, owner: member.declaringType });
  }
  return Object.freeze({ records: createCsharpReceiverCallPropertyRecords(values), issues: Object.freeze(issues) });
}
