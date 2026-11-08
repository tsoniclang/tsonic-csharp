import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpJsCallEmission } from "../../target-model/records/calls/js-value-calls.js";
import { csharpStringTargetType } from "../../target-model/types/index.js";
import { createCsharpJsCallRecords } from "../program/records/calls/js-value-calls.js";
import { forwardSourceRefusal } from "../source-evidence/representations.js";

export function analyzeCsharpJsCalls(source: TargetSourceProgram, nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpJsCallEmission>();
  const issues: TargetDiagnostic[] = [];
  const { ast, facts } = source;
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of nodes) {
    if (!admitted(node)) continue;
    const classification = operations.selectedCall.get(node);
    if (classification?.form.kind !== "js-value" || classification.form.operation.kind !== "resolved") continue;
    const operation = classification.form.operation;
    const publication = facts.applications.application(node);
    if (publication.kind === "refused") { issues.push(forwardSourceRefusal(publication)); continue; }
    const application = publication.value;
    const callee = application.callee.occurrence;
    const member = ast.is.IsPropertyAccessExpression(callee) || ast.is.IsElementAccessExpression(callee)
      ? facts.objects.use(callee) : undefined;
    if (member?.kind === "refused") { issues.push(forwardSourceRefusal(member)); continue; }
    const use = member?.value;
    const receiver = use?.receiver.occurrence ?? callee;
    if (application.sourceArguments.some(argument => argument.form === "spread") || operation.presentOperation === undefined ||
      use !== undefined && operation.receiverReadOperation === undefined || use === undefined && operation.receiverReadOperation !== undefined) {
      refuse(node, "A closed JS call requires its exact selected present invocation, member read and non-spread arguments.");
      continue;
    }
    let selectedMember: CsharpJsCallEmission["member"];
    if (use !== undefined) {
      let key: NonNullable<CsharpJsCallEmission["member"]>["key"];
      if (use.key.kind === "present") key = Object.freeze({ kind: "expression", expression: use.key.value.occurrence });
      else {
        const name = ast.name(callee);
        if (name === undefined) { refuse(node, "A closed member call requires its exact original property name occurrence."); continue; }
        const selected = facts.objects.propertyName(name);
        if (selected.kind === "refused") { issues.push(forwardSourceRefusal(selected)); continue; }
        if (selected.value.kind !== "name") { refuse(name, "A closed member call requires its supported exact Source property name."); continue; }
        key = Object.freeze({ kind: "literal", value: selected.value.name, carrier: csharpStringTargetType() });
      }
      selectedMember = Object.freeze({ read: operation.receiverReadOperation!, optional: use.optionalChain, key });
    }
    values.set(node, { operation, present: operation.presentOperation, receiver,
      arguments: Object.freeze(application.sourceArguments.map(argument => argument.operand.occurrence)),
      optionalCall: classification.optionalCallee !== undefined, callSubject: callee, member: selectedMember });
  }
  return Object.freeze({ records: createCsharpJsCallRecords(values), issues: Object.freeze(issues) });
}
