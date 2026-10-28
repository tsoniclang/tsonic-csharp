import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTypedLocationStorage } from "../../target-model/records/storage/typed-location-storage.js";
import type { CsharpJsCallRecords } from "../../target-model/records/calls/js-value-calls.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/program/source-references.js";

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
  readonly operations: Pick<CsharpTargetOperationClassifications, "selectedProperty" | "selectedElement">;
  readonly modules: CsharpSourceReferenceRecords["sourceModuleReference"];
  readonly nodes: readonly Node[]; readonly admitted: (node: Node) => boolean; readonly jsCalls: CsharpJsCallRecords }): ReadonlySet<Node> {
  const emitted = new Set<Node>();
  const unplannedCallees = new Set<Node>();
  for (const node of input.nodes) {
    const call = input.operations.selectedCall.get(node);
    const callee = call?.source?.sourceCallee.expression;
    if (callee !== undefined && !(csharpCallIsPlannedAsSourceCall(node, input) && call?.unionCall.kind !== "resolved") &&
      callee !== input.jsCalls.jsCall.get(node)?.receiver) unplannedCallees.add(callee);
  }
  const retain = (node: Node): void => { if (!unplannedCallees.has(node)) emitted.add(node); };
  for (const node of input.nodes) if (input.admitted(node)) retain(node);
  for (const node of emitted) {
    const assigned = input.ast.is.IsForOfStatement(node) ? input.ast.as.AsForInOrOfStatement(node)?.Initializer : undefined;
    if (assigned !== undefined && input.ast.is.IsIdentifier(assigned)) retain(assigned);
    const handler = input.operations.nativeHandler.get(node);
    if (handler?.kind === "typed-location" && handler.selection.kind === "location-address") {
      for (let storage: CsharpTypedLocationStorage | undefined = handler.selection.storage; storage !== undefined;
        storage = storage.kind === "value-property-storage" ? storage.receiverStorage : undefined) retain(storage.expression);
    }
    const callee = input.operations.selectedCall.get(node)?.source?.sourceCallee.expression;
    if (callee !== undefined) {
      const jsReceiver = input.jsCalls.jsCall.get(node)?.receiver;
      if (jsReceiver !== undefined) retain(jsReceiver);
      retain(callee);
    }
    const property = input.operations.selectedProperty.get(node)?.selection;
    if (property?.kind === "source-owned" && input.modules.get(node) === undefined) retain(property.source.receiver.expression);
    const element = input.operations.selectedElement.get(node)?.target;
    if (element?.kind === "source-owned") retain(element.source.receiver.expression);
  }
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
