import type { AstReader, Node } from "@tsonic/tsts";
import { targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpAdmittedCallClassification } from "../../target-model/records/call-admission.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpCallAdmissionRecords } from "../program/records/call-admission.js";

export function analyzeCsharpCallAdmission(ast: AstReader, nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  reads: CsharpValueReadClassifications, admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpAdmittedCallClassification>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, code: string, message: string, evidence: readonly string[] = []): void => {
    issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message, ...(evidence.length === 0 ? {} : { evidence }) });
  };
  for (const node of nodes) {
    if (!ast.is.IsCallExpression(node) || !admitted(node)) continue;
    const classification = operations.selectedCall.get(node);
    if (classification === undefined) { refuse(node, "CSHARP_TARGET_CALL_CLASSIFICATION_MISSING", "C# planning received a call without a sealed target classification."); continue; }
    const { target: _target, ...common } = classification;
    const form = classification.form;
    if (form.kind === "type-test") {
      const argument = classification.source?.sourceArguments[0];
      const carrier = argument === undefined ? undefined : reads.valueRead.get(argument.expression)?.value;
      if (classification.source?.sourceArguments.length !== 1 || argument === undefined || carrier === undefined ||
        !targetTypeRefEquals(carrier, form.typeTest.sourceCarrier) || !selectCsharpTypeEmission({ carrier: form.typeTest.sourceCarrier })) {
        refuse(node, "CSHARP_CLOSED_TYPE_TEST_INVALID", "Array predicate requires its exact sealed native argument and payload test.");
        continue;
      }
      values.set(node, { ...common, form });
      continue;
    }
    if (form.kind === "keep-alive") { values.set(node, { ...common, form }); continue; }
    if (form.kind === "source-flow-rejected") { refuse(node, form.sourceFlow.code, form.sourceFlow.reason); continue; }
    if (form.kind === "js-value") {
      if (form.operation.kind === "rejected") { refuse(node, "CSHARP_UNSUPPORTED_AST", form.operation.reason); continue; }
      values.set(node, { ...common, form: { ...form, operation: form.operation } });
      continue;
    }
    const target = classification.target;
    if (target === undefined) { refuse(node, "CSHARP_TARGET_CALL_CLASSIFICATION_INCOMPLETE", "The sealed C# call classification selected neither a JS-value operation nor a target call."); continue; }
    switch (target.kind) {
      case "resolved":
      case "source-owned": values.set(node, { ...common, form, target }); break;
      case "rejected": issues.push(targetDiagnosticFromExtension(node, target.diagnostic)); break;
      case "missing": refuse(node, "CSHARP_TARGET_CALL_NOT_CLOSED", target.reason); break;
      case "conflict": refuse(node, "CSHARP_TARGET_CALL_IDENTITY_CONFLICT", target.reason); break;
      case "ambiguous": refuse(node, "CSHARP_TARGET_CALL_AMBIGUOUS", target.reason, target.candidates.map(candidate => `candidate=${candidate}`)); break;
    }
  }
  return Object.freeze({ records: createCsharpCallAdmissionRecords(values), issues: Object.freeze(issues) });
}
