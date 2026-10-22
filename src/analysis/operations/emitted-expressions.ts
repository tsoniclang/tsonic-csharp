import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTypedLocationStorage } from "../../target-model/records/typed-location-storage.js";
import type { CsharpJsCallRecords } from "../../target-model/records/js-value-calls.js";

export type CsharpCallPlanningRecords = {
  readonly operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "nativeHandler">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "sourceDefaultValue" | "sourceArgument">;
};

/**
 * The expression nodes the planner renders as values: every admitted node plus the callee of each call planned as a
 * source-owned call, and every expression of an addressed typed-location storage chain (planned as the location's
 * owner, property and receiver values), the identifier a for-of loop assigns each element to, and the receiver of each
 * JS call (a direct JS call invokes its callee value, so that callee is its receiver). Any other call renders its
 * receiver and operands itself; its callee is never planned as a property or identifier value, so it is not admitted as one.
 */
export function selectCsharpEmittedExpressions(input: CsharpCallPlanningRecords & { readonly ast: AstReader;
  readonly nodes: readonly Node[]; readonly admitted: (node: Node) => boolean; readonly jsCalls: CsharpJsCallRecords }): ReadonlySet<Node> {
  const emitted = new Set<Node>();
  const unplannedCallees = new Set<Node>();
  for (const node of input.nodes) if (input.admitted(node)) {
    emitted.add(node);
    const assigned = input.ast.is.IsForOfStatement(node) ? input.ast.as.AsForInOrOfStatement(node)?.Initializer : undefined;
    if (assigned !== undefined && input.ast.is.IsIdentifier(assigned)) emitted.add(assigned);
    const handler = input.operations.nativeHandler.get(node);
    if (handler?.kind === "typed-location" && handler.selection.kind === "location-address") {
      for (let storage: CsharpTypedLocationStorage | undefined = handler.selection.storage; storage !== undefined;
        storage = storage.kind === "value-property-storage" ? storage.receiverStorage : undefined) emitted.add(storage.expression);
    }
    const callee = input.operations.selectedCall.get(node)?.source?.sourceCallee.expression;
    if (callee === undefined) continue;
    const jsReceiver = input.jsCalls.jsCall.get(node)?.receiver;
    if (jsReceiver !== undefined) emitted.add(jsReceiver);
    if (csharpCallIsPlannedAsSourceCall(node, input) || callee === jsReceiver) emitted.add(callee);
    else unplannedCallees.add(callee);
  }
  for (const callee of unplannedCallees) emitted.delete(callee);
  return emitted;
}

/**
 * A call the planner dispatches to its source-owned call path, in the planner's order: not a by-reference passing marker
 * (`out(value)`: the enclosing call passes the marked storage expression itself), not a source default value, not planned
 * by a native handler, and not a type-test, keep-alive or JS-value form.
 */
export function csharpCallIsPlannedAsSourceCall(node: Node, records: CsharpCallPlanningRecords): boolean {
  const call = records.operations.selectedCall.get(node);
  const argument = records.evidence.sourceArgument.get(node);
  if (argument?.kind === "resolved" && argument.argument.passingMode !== "by-value" && argument.argument.storageExpression !== node) return false;
  if (call?.target?.kind !== "source-owned" || records.evidence.sourceDefaultValue.get(node) !== undefined ||
    records.operations.nativeHandler.get(node) !== undefined) return false;
  const form = call.form.kind;
  return form !== "type-test" && form !== "keep-alive" && form !== "js-value";
}
