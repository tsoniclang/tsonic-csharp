import type { Node } from "@tsonic/tsts";
import type { SourceCallSelection, SourceElementAccessRecord, SourceMemberAccessSelection, SourceProgramFacts, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { sourceValueType } from "../program/source-facts.js";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpMemberReceiverEmission, CsharpMemberReceiverRecords, CsharpNativeMethodCallee, CsharpSelectedReceiverEvidence } from "../../target-model/records/objects/member-receivers.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/program/source-references.js";
import type { CsharpProjectEmissionRecords } from "../../target-model/records/program/project-emission.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import { createCsharpMemberReceiverRecords, createCsharpMemberReceiverTypeRecords } from "../program/records/objects/member-receivers.js";

export function analyzeCsharpMemberReceiverTypes(input: { readonly source: TargetSourceProgramFacts; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly projects: CsharpProjectEmissionRecords;
  readonly factories: CsharpClassFactoryIndex }): CsharpMemberReceiverRecords["memberReceiver"] {
  const receivers = new Map<Node, Map<Node | undefined, CsharpMemberReceiverEmission>>();
  const { syntax: ast, facts } = input.source;
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
    if (property?.kind === "resolved" || property?.kind === "source-owned" || property?.kind === "union-property") receiver(csharpSelectedReceiver(facts, property.source));
    const element = input.operations.selectedElement.get(node)?.target;
    if (element?.kind === "resolved" || element?.kind === "source-owned" || element?.kind === "project-indexer") receiver(csharpSelectedReceiver(facts, element.source));
    const call = input.operations.selectedCall.get(node);
    if (call?.source?.receiver !== undefined) receiver(csharpSelectedReceiver(facts, call.source));
    const construction = input.operations.selectedConstruction.get(node);
    if ((construction?.target?.kind === "resolved" || construction?.target?.kind === "source-owned") && construction.target.source.receiver !== undefined)
      receiver(csharpSelectedReceiver(facts, construction.target.source));
  }
  return createCsharpMemberReceiverTypeRecords(receivers);
}

export function analyzeCsharpMemberReceivers(input: { readonly source: TargetSourceProgramFacts; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly references: CsharpSourceReferenceRecords;
  readonly receivers: CsharpMemberReceiverRecords["memberReceiver"]; readonly admitted: (node: Node) => boolean }) {
  const functions = new Map<Node, "identifier" | "module">();
  const methods = new Map<Node, CsharpNativeMethodCallee>();
  const issues: TargetDiagnostic[] = [];
  const { syntax: ast, facts } = input.source;
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const call = input.operations.selectedCall.get(node);
    if (call?.unionCall?.kind === "resolved") continue;
    const selected = call?.sourceCall;
    if (call?.target?.kind !== "source-owned" || selected === undefined || selected.kind !== "function" && selected.kind !== "method") continue;
    const refuse = (code: `CSHARP_${string}`, message: string): void => { issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: selected.expression, message }); };
    if (selected.kind === "function") {
      if (functions.has(selected.expression)) continue;
      if (ast.is.IsIdentifier(selected.expression)) {
        if (input.references.identifierEmission.get(selected.expression) === undefined) { refuse("CSHARP_METHOD_GROUP_REFERENCE_NOT_EMITTABLE", "A selected native function group has no exact declaration reference syntax."); continue; }
        functions.set(selected.expression, "identifier");
      } else if (input.references.sourceModuleReference.get(selected.expression) !== undefined) functions.set(selected.expression, "module");
      else refuse("CSHARP_METHOD_GROUP_REFERENCE_NOT_EMITTABLE", "A selected native function group has no exact declaration reference syntax.");
      continue;
    }
    if (methods.has(selected.expression)) continue;
    const element = input.operations.selectedElement.get(selected.expression);
    const property = input.operations.selectedProperty.get(selected.expression);
    const selection = element?.target ?? property?.selection;
    const member = input.operations.sourceMember.get(selected.expression);
    if (selection?.kind !== "source-owned" || member === undefined || property?.selection === selection && selection.source.access !== "call" || member.jsValueOperation.kind !== "not-js-value" ||
      member.runtimeUnionProperty.kind !== "not-runtime-union" || member.objectShape !== undefined && member.shapeMember?.kind !== "resolved" ||
      member.shapeMember !== undefined && member.shapeMember.kind !== "resolved" || member.shapeMember?.kind === "resolved" && member.shapeMember.member.memberKind !== "method") {
      if (call?.unionCall?.kind === "rejected") refuse("CSHARP_UNION_METHOD_CALL_NOT_REPRESENTABLE", call.unionCall.reason);
      else refuse("CSHARP_SOURCE_METHOD_MEMBER_NOT_SELECTED", "A direct source method requires its exact sealed native member selection.");
      continue;
    }
    const projection = element?.receiverProjection ?? property?.receiverProjection;
    const selectedReceiver = csharpSelectedReceiver(facts, selection.source);
    const receiver = input.receivers.get(selectedReceiver.expression, selectedReceiver.valueDeclaration)
      ?? failTargetAnalysisInvariant("tsonic-csharp", "A selected native method requires its completed receiver type-or-value classification.", selected.expression);
    if (receiver.kind === "type" && projection?.conversion.kind === "rejected") { refuse("CSHARP_STATIC_RECEIVER_CONVERSION_REJECTED", projection.conversion.reason); continue; }
    const key = element?.target?.kind === "source-owned" ? ast.as.AsElementAccessExpression(selected.expression)?.ArgumentExpression : undefined;
    methods.set(selected.expression, { receiver: selectedReceiver, projection, key,
      suspends: key !== undefined && facts.navigation.expressions.effects(key).suspends });
  }
  return Object.freeze({ records: createCsharpMemberReceiverRecords({ receivers: input.receivers, functions, methods }), issues: Object.freeze(issues) });
}

/** The receiver of a selected member, element, call or construction: its expression, published type and value declaration. */
function csharpSelectedReceiver(facts: SourceProgramFacts,
  selection: SourceMemberAccessSelection | SourceElementAccessRecord | SourceCallSelection): CsharpSelectedReceiverEvidence {
  const expression = selection.receiver ?? failTargetAnalysisInvariant("tsonic-csharp", "A selected receiver requires its receiver expression.",
    "node" in selection ? selection.node : selection.use);
  if ("receiverValue" in selection) return Object.freeze({ expression, type: selection.receiverType,
    ...(selection.receiverValue?.declaration === undefined ? {} : { valueDeclaration: selection.receiverValue.declaration }) });
  return Object.freeze({ expression, type: "receiverType" in selection ? selection.receiverType : sourceValueType(facts, expression) });
}
