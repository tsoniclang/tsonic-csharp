import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpRestSequence, CsharpRestSequenceEmission } from "../../target-model/records/rest-sequences.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { selectCsharpSequenceEmission } from "../../policy/conversions/sequence-emission.js";
import { createCsharpRestSequenceRecords } from "../program/records/rest-sequences.js";

export function analyzeCsharpRestSequences(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  reads: CsharpValueReadClassifications, admitted: (node: Node) => boolean) {
  const values = new Map<CsharpRestSequence, CsharpRestSequenceEmission>();
  // Every carrier the planner renders for a rest sequence: the source collection, the collected result and the
  // per-element conversions. Type emission must cover them.
  const carriers: TargetTypeRef[] = [];
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    if (!admitted(node)) continue;
    const selection = operations.selectedCall.get(node)?.target ?? operations.selectedConstruction.get(node)?.target;
    if (selection?.kind !== "resolved") continue;
    for (const sequence of selection.call.sequenceArguments ?? []) {
      if (values.has(sequence)) continue;
      const actual = reads.valueRead.get(sequence.expression)?.value;
      if (actual === undefined || !targetTypeRefEquals(actual, sequence.sourceType) || sequence.elements.length !== (actual.kind === "tuple" ? actual.elements.length : 1)) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: sequence.expression,
          message: "A selected rest sequence requires its exact native source carrier and element conversions." });
        continue;
      }
      const selected = selectCsharpSequenceEmission(actual, sequence.targetElementType, sequence.elements.map(element => ({ carrier: element.type, conversion: element.conversion })));
      if (selected.kind === "rejected") {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: sequence.expression, message: selected.reason });
        continue;
      }
      carriers.push(selected.value.carrier, selected.value.sequence.resultCarrier, sequence.targetElementType,
        ...selected.value.elements.map(element => element.carrier));
      values.set(sequence, { spread: selected.value, direct: actual.kind !== "tuple" && sequence.semantics === "native" && sequence.elements[0]?.conversion.kind === "identity" });
    }
  }
  return Object.freeze({ records: createCsharpRestSequenceRecords(values), carriers: Object.freeze(carriers), issues: Object.freeze(issues) });
}
