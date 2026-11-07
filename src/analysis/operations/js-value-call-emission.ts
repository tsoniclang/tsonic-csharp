import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpJsCallEmission } from "../../target-model/records/calls/js-value-calls.js";
import { csharpStringTargetType } from "../../target-model/types/index.js";
import { createCsharpJsCallRecords } from "../program/records/calls/js-value-calls.js";

export function analyzeCsharpJsCalls(ast: AstReader, nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  admitted: (node: Node) => boolean) {
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
    // The callee's authored member form (syntax only): a property or element access names a receiver and a key.
    const callee = source?.callee ?? call?.Expression;
    const member = callee === undefined ? undefined : ast.is.IsPropertyAccessExpression(callee)
      ? { kind: "property" as const, expression: callee, receiver: ast.as.AsPropertyAccessExpression(callee)?.Expression }
      : ast.is.IsElementAccessExpression(callee)
        ? { kind: "element" as const, expression: callee, receiver: ast.as.AsElementAccessExpression(callee)?.Expression,
          key: ast.as.AsElementAccessExpression(callee)?.ArgumentExpression }
        : undefined;
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
      const name = member.kind === "property" ? ast.as.AsPropertyAccessExpression(member.expression)?.name : undefined;
      if (member.kind === "property" && name === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A closed member call requires its exact authored property name.", node);
      if (member.kind === "element" && member.key === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A closed element call requires its authored key.", node);
      const syntax = member.kind === "property" ? ast.as.AsPropertyAccessExpression(member.expression) : ast.as.AsElementAccessExpression(member.expression);
      selectedMember = Object.freeze({ read: operation.receiverReadOperation!, optional: syntax?.QuestionDotToken !== undefined,
        key: member.kind === "element" ? Object.freeze({ kind: "expression", expression: member.key! })
          : Object.freeze({ kind: "literal", value: ast.text(name), carrier: csharpStringTargetType() }) });
    }
    values.set(node, { operation, present: operation.presentOperation, receiver, arguments: Object.freeze(exact),
      optionalCall: call?.QuestionDotToken !== undefined, callSubject: callee ?? receiver, member: selectedMember });
  }
  return Object.freeze({ records: createCsharpJsCallRecords(values), issues: Object.freeze(issues) });
}
