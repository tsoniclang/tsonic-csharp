import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpMemberReceiverEmission, CsharpMemberReceiverRecords, CsharpNativeMethodCallee, CsharpSelectedReceiverEvidence } from "../../target-model/records/objects/member-receivers.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/program/source-references.js";
import type { CsharpProjectEmissionRecords } from "../../target-model/records/program/project-emission.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import { createCsharpMemberReceiverRecords, createCsharpMemberReceiverTypeRecords } from "../program/records/objects/member-receivers.js";

export function analyzeCsharpMemberReceiverTypes(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly projects: CsharpProjectEmissionRecords;
  readonly factories: CsharpClassFactoryIndex }): CsharpMemberReceiverRecords["memberReceiver"] {
  const receivers = new Map<Node, Map<Node | undefined, CsharpMemberReceiverEmission>>();
  const { ast } = input.source;
  const receiver = (selected: CsharpSelectedReceiverEvidence): CsharpMemberReceiverEmission => {
    const entries = receivers.get(selected.expression) ?? new Map<Node | undefined, CsharpMemberReceiverEmission>();
    const previous = entries.get(selected.valueDeclaration);
    if (previous !== undefined) return previous;
    const reference = selected.valueDeclaration === undefined ? selected.expression : ast.name(selected.valueDeclaration);
    const declaration = reference === undefined ? undefined : input.projects.projectSourceReference.get(reference);
    const value: CsharpMemberReceiverEmission = reference !== undefined && declaration !== undefined &&
      (selected.valueDeclaration === undefined || declaration === selected.valueDeclaration) && input.factories.classFactory.get(declaration) === undefined &&
      input.projects.projectSourceType.get(declaration) !== undefined ? { kind: "type", reference } : { kind: "value" };
    entries.set(selected.valueDeclaration, Object.freeze(value));
    receivers.set(selected.expression, entries);
    return value;
  };
  for (const node of input.nodes) {
    const property = input.operations.selectedProperty.get(node)?.selection;
    if (property?.kind === "resolved" || property?.kind === "source-owned" || property?.kind === "union-property") receiver(property.source.receiver);
    const element = input.operations.selectedElement.get(node)?.target;
    if (element?.kind === "resolved" || element?.kind === "source-owned" || element?.kind === "project-indexer") receiver(element.source.receiver);
    const call = input.operations.selectedCall.get(node);
    if (call?.source?.sourceReceiver !== undefined) receiver(call.source.sourceReceiver);
    const construction = input.operations.selectedConstruction.get(node);
    if ((construction?.target?.kind === "resolved" || construction?.target?.kind === "source-owned") && construction.target.source.sourceReceiver !== undefined)
      receiver(construction.target.source.sourceReceiver);
  }
  return createCsharpMemberReceiverTypeRecords(receivers);
}

export function analyzeCsharpMemberReceivers(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly references: CsharpSourceReferenceRecords;
  readonly receivers: CsharpMemberReceiverRecords["memberReceiver"]; readonly admitted: (node: Node) => boolean }) {
  const functions = new Map<Node, "identifier" | "module">();
  const methods = new Map<Node, CsharpNativeMethodCallee>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input.source;
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const call = input.operations.selectedCall.get(node);
    if (call?.unionCall?.kind === "resolved") continue;
    const selected = call?.sourceCall;
    if (call?.target?.kind !== "source-owned" || selected === undefined || selected.kind !== "function" && selected.kind !== "method") continue;
    const refuse = (message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: selected.expression, message }); };
    if (selected.kind === "function") {
      if (functions.has(selected.expression)) continue;
      if (ast.is.IsIdentifier(selected.expression)) {
        if (input.references.identifierEmission.get(selected.expression) === undefined) { refuse("A selected native function group has no exact declaration reference syntax."); continue; }
        functions.set(selected.expression, "identifier");
      } else if (input.references.sourceModuleReference.get(selected.expression) !== undefined) functions.set(selected.expression, "module");
      else refuse("A selected native function group has no exact declaration reference syntax.");
      continue;
    }
    if (methods.has(selected.expression)) continue;
    const element = input.operations.selectedElement.get(selected.expression);
    const property = input.operations.selectedProperty.get(selected.expression);
    const selection = element?.target ?? property?.selection;
    const member = input.operations.sourceMember.get(selected.expression);
    if (selection?.kind !== "source-owned" || member === undefined || !selection.source.callCallee || member.jsValueOperation.kind !== "not-js-value" ||
      member.runtimeUnionProperty.kind !== "not-runtime-union" || member.objectShape !== undefined && member.shapeMember?.kind !== "resolved" ||
      member.shapeMember !== undefined && member.shapeMember.kind !== "resolved" || member.shapeMember?.kind === "resolved" && member.shapeMember.member.memberKind !== "method") {
      refuse(call?.unionCall?.kind === "rejected" ? call.unionCall.reason
        : "A direct source method requires its exact sealed native member selection."); continue;
    }
    const projection = element?.receiverProjection ?? property?.receiverProjection;
    const receiver = input.receivers.get(selection.source.receiver.expression, selection.source.receiver.valueDeclaration)
      ?? failTargetAnalysisInvariant("tsonic-csharp", "A selected native method requires its completed receiver type-or-value classification.", selected.expression);
    if (receiver.kind === "type" && projection?.conversion.kind === "rejected") { refuse(projection.conversion.reason); continue; }
    const key = element?.target?.kind === "source-owned" ? element.target.source.argument.expression : undefined;
    methods.set(selected.expression, { receiver: selection.source.receiver, projection, key,
      suspends: key !== undefined && input.source.navigation.expressionEffects(key).suspends });
  }
  return Object.freeze({ records: createCsharpMemberReceiverRecords({ receivers: input.receivers, functions, methods }), issues: Object.freeze(issues) });
}
