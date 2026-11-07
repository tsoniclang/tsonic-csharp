import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpJsCallEmission } from "../../target-model/records/calls/js-value-calls.js";
import { csharpStringTargetType } from "../../target-model/types/index.js";
import { createCsharpJsCallRecords } from "../program/records/calls/js-value-calls.js";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpCalleeAccess } from "./js-value-calls.js";

export function analyzeCsharpJsCalls(ast: AstReader, facts: Pick<SourceProgramFacts, "navigation" | "selections" | "values">,
  nodes: readonly Node[], operations: CsharpTargetOperationClassifications, admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpJsCallEmission>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => { issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of nodes) {
    if (!admitted(node)) continue;
    const classification = operations.selectedCall.get(node);
    if (classification?.form.kind !== "js-value" || classification.form.operation.kind !== "resolved") continue;
    const operation = classification.form.operation;
    const source = classification.source;
    const call = ast.as.AsCallExpression(node);
    // The callee's member access, receiver and key from the Host selections (csharpCalleeAccess, through wrappers).
    const callee = source?.callee ?? call?.Expression;
    const member = source === undefined ? undefined : csharpCalleeAccess(ast, facts, source);
    const receiver = member === undefined ? callee : member.receiver;
    const arguments_ = ast.arguments(node);
    const exact = arguments_.filter((argument): argument is Node => argument !== undefined);
    if (receiver === undefined || exact.length !== arguments_.length || exact.some(argument => ast.is.IsSpreadElement(argument)) || operation.presentOperation === undefined ||
      member !== undefined && operation.receiverReadOperation === undefined || member === undefined && operation.receiverReadOperation !== undefined) {
      refuse(node, "CSHARP_JS_CALL_SHAPE_NOT_CLOSED", "A closed JS call requires its exact selected present invocation, member read and non-spread arguments.");
      continue;
    }
    let selectedMember: CsharpJsCallEmission["member"];
    if (member !== undefined) {
      if (member.kind === "element" && member.key === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A closed element call requires its authored key.", node);
      const syntax = member.kind === "property" ? ast.as.AsPropertyAccessExpression(member.access) : ast.as.AsElementAccessExpression(member.access);
      selectedMember = Object.freeze({ read: operation.receiverReadOperation!, optional: syntax?.QuestionDotToken !== undefined,
        key: member.kind === "element" ? Object.freeze({ kind: "expression", expression: member.key! })
          : Object.freeze({ kind: "literal", value: member.name, carrier: csharpStringTargetType() }) });
    }
    values.set(node, { operation, present: operation.presentOperation, receiver, arguments: Object.freeze(exact),
      optionalCall: call?.QuestionDotToken !== undefined, callSubject: callee ?? receiver, member: selectedMember });
  }
  return Object.freeze({ records: createCsharpJsCallRecords(values), issues: Object.freeze(issues) });
}
