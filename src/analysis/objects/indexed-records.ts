import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpIndexedRecordRead } from "../../target-model/records/indexed-records.js";
import { selectCsharpIndexedRecordRead } from "../../policy/objects/indexed-records.js";
import { createCsharpIndexedRecordRecords } from "../program/records/indexed-records.js";

export function analyzeCsharpIndexedRecords(nodes: readonly Node[], operations: Pick<CsharpTargetOperationClassifications, "selectedProperty" | "selectedElement">) {
  const values = new Map<Node, CsharpIndexedRecordRead>();
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    const property = operations.selectedProperty.get(node)?.selection;
    const element = operations.selectedElement.get(node)?.target;
    const selected = property?.kind === "resolved" && property.invocation.kind === "source-name-indexer" && property.invocation.optionalRead
      ? { optional: property.source.optionalChain, owner: property.targetMember.declaringType, value: property.targetMember.returnType }
      : element?.kind === "resolved" && element.invocation.kind === "record-optional-read" && element.source.accessMode === "read"
        ? { optional: false, owner: element.targetMember.declaringType, value: element.targetMember.returnType } : undefined;
    if (selected === undefined) continue;
    const selection = selectCsharpIndexedRecordRead(selected);
    if (selection.kind === "rejected") issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: selection.reason });
    else values.set(node, selection.value);
  }
  return Object.freeze({ records: createCsharpIndexedRecordRecords(values), issues: Object.freeze(issues) });
}
