import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpAdmittedElementClassification, CsharpElementEmission, CsharpElementRead } from "../../target-model/records/objects/element-admission.js";
import type { CsharpMemberReceiverRecords } from "../../target-model/records/objects/member-receivers.js";
import { csharpSelectedSourceDeclarations } from "./selected-members.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType, getCsharpReadOnlyIndexableCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpCollectionElementRead } from "../../policy/operations/collections/element-reads.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpElementAdmissionRecords } from "../program/records/objects/element-admission.js";
import { resolveCsharpNativePropertyRead } from "./native-property-reads.js";

export function analyzeCsharpElementAdmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly demand: CsharpNativeDemandAnalysis;
  readonly admitted: (node: Node) => boolean; readonly receivers: CsharpMemberReceiverRecords;
  readonly policy: CsharpPolicyContext }) {
  const values = new Map<Node, CsharpAdmittedElementClassification>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input;
  const { facts } = input.policy;
  const refuse = (node: Node, message: string, code: `CSHARP_${string}`, evidence: readonly string[] = []): void => {
    issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message, ...(evidence.length === 0 ? {} : { evidence }) });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !ast.is.IsElementAccessExpression(node)) continue;
    const classification = input.operations.selectedElement.get(node);
    if (classification === undefined) { refuse(node, "C# planning received an element access without a sealed target classification.", "CSHARP_TARGET_ELEMENT_CLASSIFICATION_MISSING"); continue; }
    const jsValue = classification.jsValue;
    if (jsValue.kind === "rejected") { refuse(node, jsValue.reason, "CSHARP_JS_VALUE_ELEMENT_NOT_REPRESENTABLE"); continue; }
    const syntax = ast.as.AsElementAccessExpression(node);
    if (classification.receiverType !== undefined && syntax?.ArgumentExpression !== undefined &&
      ast.is.IsStringLiteral(syntax.ArgumentExpression)) {
      const source = facts.values.elementAccess(node);
      if (source.access === "read" && resolveCsharpNativePropertyRead(csharpSelectedSourceDeclarations(source),
        classification.receiverType, input.policy).kind === "resolved") {
        refuse(node, "Literal-key access to an inherited native Error property is unsupported in v1; use the declared property access instead.",
          "CSHARP_ERROR_LITERAL_PROPERTY_UNSUPPORTED");
        continue;
      }
    }
    const use = input.demand.nativeUse.expression(node)?.use;
    if (use === undefined || use.kind === "erased") { refuse(node, "An admitted element access requires its exact native result representation.", "CSHARP_ELEMENT_RESULT_NOT_REPRESENTED"); continue; }
    const result = use.carrier;
    if (jsValue.kind === "resolved") {
      const syntax = ast.as.AsElementAccessExpression(node);
      if (syntax?.Expression === undefined || syntax.ArgumentExpression === undefined) { refuse(node, "A JS-value element read requires an exact receiver and key.", "CSHARP_JS_VALUE_ELEMENT_NOT_REPRESENTABLE"); continue; }
      const optional = syntax.QuestionDotToken !== undefined;
      const operation = optional ? jsValue.presentOperation : jsValue;
      if (operation === undefined) { refuse(node, "An optional closed element read requires its exact selected present invocation.", "CSHARP_JS_VALUE_ELEMENT_NOT_REPRESENTABLE"); continue; }
      values.set(node, { ...classification, target: undefined, jsValue, emission: { kind: "js-value", receiver: syntax.Expression,
        key: syntax.ArgumentExpression, result, optional, operation } });
      continue;
    }
    const selection = classification.target;
    if (selection === undefined) { refuse(node, "The sealed C# element classification selected neither a JS-value operation nor a target element.", "CSHARP_TARGET_ELEMENT_CLASSIFICATION_INCOMPLETE"); continue; }
    if (selection.kind === "rejected") { issues.push(targetDiagnosticFromExtension(node, selection.diagnostic)); continue; }
    if (selection.kind === "missing") { refuse(node, selection.reason, "CSHARP_TARGET_ELEMENT_NOT_CLOSED"); continue; }
    if (selection.kind === "conflict") { refuse(node, selection.reason, "CSHARP_TARGET_ELEMENT_IDENTITY_CONFLICT"); continue; }
    if (selection.kind === "ambiguous") { refuse(node, selection.reason, "CSHARP_TARGET_ELEMENT_AMBIGUOUS", selection.candidates.map(candidate => `candidate=${candidate}`)); continue; }
    const elementSyntax = ast.as.AsElementAccessExpression(node);
    const key = elementSyntax?.ArgumentExpression ?? failTargetAnalysisInvariant("tsonic-csharp", "An element access requires its argument expression.", node);
    const common = { receiver: selection.source.receiver, key, result,
      optional: selection.source.optionalChain, projection: classification.receiverProjection };
    let emission: CsharpElementEmission;
    if (selection.kind === "project-indexer") {
      if (!selectCsharpTypeEmission({ carrier: selection.keyType })) { refuse(node, "The exact selected project index key has no renderable C# target type.", "CSHARP_PROJECT_INDEX_KEY_NOT_RENDERABLE"); continue; }
      if (classification.selectedResultType === undefined || selection.source.access === "read" && selection.selectedReadType !== undefined && classification.flowReadConversion === undefined) {
        refuse(node, "The exact selected project index read has no closed native result conversion.", "CSHARP_PROJECT_INDEX_READ_CONVERSION_NOT_CLOSED"); continue;
      }
      emission = { ...common, kind: "access", indexType: selection.keyType, read: { kind: "index" },
        conversion: selection.source.access !== "read" || selection.selectedReadType === undefined ? undefined :
          { source: selection.valueType, target: selection.selectedReadType, conversion: classification.flowReadConversion! } };
    } else if (selection.kind === "source-owned") {
      const receiverType = classification.receiverType;
      if (classification.sourceOwned !== undefined) {
        const staticReceiver = input.receivers.memberReceiver.get(selection.source.receiver, undefined)?.kind === "type";
        const receiverUse = input.demand.nativeUse.expression(selection.source.receiver)?.use;
        const present = receiverUse === undefined || receiverUse.kind === "erased" ? undefined :
          getCsharpGenericOptionalParts(receiverUse.carrier)?.element ?? getCsharpNullableElementTargetType(receiverUse.carrier) ?? receiverUse.carrier;
        if (present === undefined) { refuse(node, "An admitted source member index requires its exact native receiver representation.", "CSHARP_ELEMENT_RECEIVER_NOT_REPRESENTED"); continue; }
        emission = { ...common, kind: "source-member", static: staticReceiver, present,
          suspends: facts.navigation.expressions.effects(common.key).suspends, writable: selection.source.access !== "read" };
      } else {
        const carrier = getCsharpNullableElementTargetType(receiverType) ?? receiverType;
        if (carrier?.kind === "tuple" && selection.source.selected.kind === "tuple") {
          emission = { ...common, kind: "tuple", member: `Item${selection.source.selected.position + 1}` };
        } else {
          const element = getCsharpReadOnlyIndexableCollectionElementTargetType(carrier);
          const expected = element === undefined ? undefined : common.optional ? csharpNullableTargetType(element) : element;
          if (element === undefined || classification.selectedResultType === undefined || expected === undefined || !targetTypeRefEquals(expected, classification.selectedResultType) ||
            selection.source.access !== "read" && !isCsharpDenseMutableCollectionTargetType(carrier) && carrier?.kind !== "array") {
            refuse(node, "The exact selected source element access has no matching C# indexable target representation.", "CSHARP_ELEMENT_TARGET_NOT_INDEXABLE"); continue;
          }
          const read = carrier === undefined ? undefined : csharpCollectionElementRead(carrier);
          if (read?.kind === "invalid") { refuse(node, read.reason, "CSHARP_COLLECTION_ELEMENT_READ_INVALID"); continue; }
          emission = { ...common, kind: "access", indexType: undefined, conversion: undefined,
            read: read?.kind === "method" && selection.source.access === "read" ? { kind: "collection", carrier: carrier! } : { kind: "index" } };
        }
      }
    } else {
      if (selection.receiver.kind !== "instance") { refuse(node, "Checked element access requires an exact instance C# target relation.", "CSHARP_ELEMENT_RELATION_NOT_INSTANCE"); continue; }
      const parameter = selection.targetMember.parameters[selection.targetParameterIndex];
      if (parameter === undefined || !selectCsharpTypeEmission({ carrier: parameter.type })) { refuse(node, "Selected C# indexer has no renderable related index parameter.", "CSHARP_INDEXER_PARAMETER_NOT_RENDERABLE"); continue; }
      if (parameter.passingMode !== undefined && parameter.passingMode !== "by-value") { refuse(node, "C# indexer arguments cannot use ref, in, or out passing.", "CSHARP_INDEXER_BY_REFERENCE_ARGUMENT"); continue; }
      let read: CsharpElementRead;
      const invocation = selection.invocation;
      if (invocation.kind === "record-optional-read") {
        if (selection.source.access !== "read") { refuse(node, "A readonly native record read cannot be selected as writable storage.", "CSHARP_READONLY_ELEMENT_WRITE"); continue; }
        read = { kind: "record-optional" };
      } else if (invocation.kind === "array-like") {
        const owner = selection.targetMember.declaringType;
        if (owner === undefined || !selectCsharpTypeEmission({ carrier: owner })) { refuse(node, "An admitted native array-like index requires its exact renderable target owner.", "CSHARP_INDEXER_OWNER_NOT_RENDERABLE"); continue; }
        read = { kind: "array-like", owner, name: selection.targetMember.targetName, projection: invocation.projection };
      } else if (invocation.kind === "method") {
        if (selection.source.access !== "read") { refuse(node, "A source element write cannot lower through a read-only target method relation.", "CSHARP_READONLY_ELEMENT_WRITE"); continue; }
        read = { kind: "method", name: invocation.targetName, append: invocation.appendInt32Literal };
      } else {
        if (selection.targetMember.kind !== "indexer") { refuse(node, "Checked element access selected indexer invocation without an exact C# indexer member.", "CSHARP_INDEXER_MEMBER_NOT_SELECTED"); continue; }
        const carrier = selection.targetMember.declaringType;
        const selected = carrier === undefined ? undefined : csharpCollectionElementRead(carrier);
        if (selected?.kind === "invalid") { refuse(node, selected.reason, "CSHARP_COLLECTION_ELEMENT_READ_INVALID"); continue; }
        if (selected?.kind === "method" && selection.source.access !== "read") { refuse(node, "A readonly native collection read cannot be selected as writable storage.", "CSHARP_READONLY_ELEMENT_WRITE"); continue; }
        read = selected?.kind === "method" ? { kind: "collection", carrier: carrier! } : { kind: "index" };
      }
      emission = { ...common, kind: "access", read, indexType: parameter.type, conversion: undefined };
    }
    values.set(node, { ...classification, jsValue, target: selection, emission: Object.freeze(emission) });
  }
  return Object.freeze({ records: createCsharpElementAdmissionRecords(values), issues: Object.freeze(issues) });
}
