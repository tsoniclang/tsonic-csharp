import type { AstReader, Node } from "@tsonic/tsts";
import { targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpAdmittedElementClassification, CsharpElementEmission, CsharpElementRead } from "../../target-model/records/element-admission.js";
import type { CsharpProjectEmissionRecords } from "../../target-model/records/project-emission.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import { csharpNullableTargetType, getCsharpNullableElementTargetType, getCsharpReadOnlyIndexableCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpCollectionElementRead } from "../../target-model/types/carriers/collection-reads.js";
import { selectCsharpTypeEmission } from "../../policy/types/type-emission.js";
import { createCsharpElementAdmissionRecords } from "../program/records/element-admission.js";

export function analyzeCsharpElementAdmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly demand: CsharpNativeDemandAnalysis;
  readonly admitted: (node: Node) => boolean; readonly projects: CsharpProjectEmissionRecords;
  readonly factories: CsharpClassFactoryIndex; readonly navigation: SourceProgramNavigation }) {
  const values = new Map<Node, CsharpAdmittedElementClassification>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input;
  const refuse = (node: Node, message: string, code = "CSHARP_UNSUPPORTED_AST", evidence: readonly string[] = []): void => {
    issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message, ...(evidence.length === 0 ? {} : { evidence }) });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !ast.is.IsElementAccessExpression(node)) continue;
    const classification = input.operations.selectedElement.get(node);
    if (classification === undefined) { refuse(node, "C# planning received an element access without a sealed target classification.", "CSHARP_TARGET_ELEMENT_CLASSIFICATION_MISSING"); continue; }
    const jsValue = classification.jsValue;
    if (jsValue.kind === "rejected") { refuse(node, jsValue.reason); continue; }
    const use = input.demand.nativeUse.expression(node)?.use;
    if (use === undefined || use.kind === "erased") { refuse(node, "An admitted element access requires its exact native result representation."); continue; }
    const result = use.carrier;
    if (jsValue.kind === "resolved") {
      const syntax = ast.as.AsElementAccessExpression(node);
      if (syntax?.Expression === undefined || syntax.ArgumentExpression === undefined) { refuse(node, "A JS-value element read requires an exact receiver and key."); continue; }
      const optional = syntax.QuestionDotToken !== undefined;
      const operation = optional ? jsValue.presentOperation : jsValue;
      if (operation === undefined) { refuse(node, "An optional closed element read requires its exact selected present invocation."); continue; }
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
    const common = { receiver: selection.source.receiver, key: selection.source.argument.expression, result,
      optional: selection.source.optionalChain, projection: classification.receiverProjection };
    let emission: CsharpElementEmission;
    if (selection.kind === "project-indexer") {
      if (!selectCsharpTypeEmission({ carrier: selection.keyType })) { refuse(node, "The exact selected project index key has no renderable C# target type."); continue; }
      if (classification.selectedResultType === undefined || selection.source.accessMode === "read" && selection.selectedReadType !== undefined && classification.flowReadConversion === undefined) {
        refuse(node, "The exact selected project index read has no closed native result conversion."); continue;
      }
      emission = { ...common, kind: "access", indexType: selection.keyType, read: { kind: "index" },
        conversion: selection.source.accessMode !== "read" || selection.selectedReadType === undefined ? undefined :
          { source: selection.valueType, target: selection.selectedReadType, conversion: classification.flowReadConversion! } };
    } else if (selection.kind === "source-owned") {
      const receiverType = classification.receiverType;
      if (classification.sourceOwned !== undefined) {
        const reference = selection.source.receiver.valueDeclaration === undefined ? selection.source.receiver.expression : ast.name(selection.source.receiver.valueDeclaration);
        const declaration = reference === undefined ? undefined : input.projects.projectSourceReference.get(reference);
        const staticReceiver = declaration !== undefined && (selection.source.receiver.valueDeclaration === undefined || declaration === selection.source.receiver.valueDeclaration) &&
          input.factories.classFactory.get(declaration) === undefined && input.projects.projectSourceType.get(declaration) !== undefined;
        const receiverUse = input.demand.nativeUse.expression(selection.source.receiver.expression)?.use;
        const present = receiverUse === undefined || receiverUse.kind === "erased" ? undefined :
          getCsharpGenericOptionalParts(receiverUse.carrier)?.element ?? getCsharpNullableElementTargetType(receiverUse.carrier) ?? receiverUse.carrier;
        if (present === undefined) { refuse(node, "An admitted source member index requires its exact native receiver representation."); continue; }
        emission = { ...common, kind: "source-member", static: staticReceiver, present,
          suspends: input.navigation.expressionEffects(common.key).suspends, writable: selection.source.accessMode !== "read" };
      } else {
        const carrier = getCsharpNullableElementTargetType(receiverType) ?? receiverType;
        if (carrier?.kind === "tuple" && selection.source.selectedElementIndex !== undefined) {
          emission = { ...common, kind: "tuple", member: `Item${selection.source.selectedElementIndex + 1}` };
        } else {
          const element = getCsharpReadOnlyIndexableCollectionElementTargetType(carrier);
          const expected = element === undefined ? undefined : common.optional ? csharpNullableTargetType(element) : element;
          if (element === undefined || classification.selectedResultType === undefined || expected === undefined || !targetTypeRefEquals(expected, classification.selectedResultType) ||
            selection.source.accessMode !== "read" && !isCsharpDenseMutableCollectionTargetType(carrier) && carrier?.kind !== "array") {
            refuse(node, "The exact selected source element access has no matching C# indexable target representation."); continue;
          }
          const read = carrier === undefined ? undefined : csharpCollectionElementRead(carrier);
          if (read?.kind === "invalid") { refuse(node, read.reason); continue; }
          emission = { ...common, kind: "access", indexType: undefined, conversion: undefined,
            read: read?.kind === "method" && selection.source.accessMode === "read" ? { kind: "collection", carrier: carrier! } : { kind: "index" } };
        }
      }
    } else {
      if (selection.receiver.kind !== "instance") { refuse(node, "Checked element access requires an exact instance C# target relation."); continue; }
      const parameter = selection.targetMember.parameters[selection.targetParameterIndex];
      if (parameter === undefined || !selectCsharpTypeEmission({ carrier: parameter.type })) { refuse(node, "Selected C# indexer has no renderable related index parameter."); continue; }
      if (parameter.passingMode !== undefined && parameter.passingMode !== "by-value") { refuse(node, "C# indexer arguments cannot use ref, in, or out passing."); continue; }
      let read: CsharpElementRead;
      const invocation = selection.invocation;
      if (invocation.kind === "record-optional-read") {
        if (selection.source.accessMode !== "read") { refuse(node, "A readonly native record read cannot be selected as writable storage."); continue; }
        read = { kind: "record-optional" };
      } else if (invocation.kind === "array-like") {
        const owner = selection.targetMember.declaringType;
        if (owner === undefined || !selectCsharpTypeEmission({ carrier: owner })) { refuse(node, "An admitted native array-like index requires its exact renderable target owner."); continue; }
        read = { kind: "array-like", owner, name: selection.targetMember.targetName, projection: invocation.projection };
      } else if (invocation.kind === "method") {
        if (selection.source.accessMode !== "read") { refuse(node, "A source element write cannot lower through a read-only target method relation."); continue; }
        read = { kind: "method", name: invocation.targetName, append: invocation.appendInt32Literal };
      } else {
        if (selection.targetMember.kind !== "indexer") { refuse(node, "Checked element access selected indexer invocation without an exact C# indexer member."); continue; }
        const carrier = selection.targetMember.declaringType;
        const selected = carrier === undefined ? undefined : csharpCollectionElementRead(carrier);
        if (selected?.kind === "invalid") { refuse(node, selected.reason); continue; }
        if (selected?.kind === "method" && selection.source.accessMode !== "read") { refuse(node, "A readonly native collection read cannot be selected as writable storage."); continue; }
        read = selected?.kind === "method" ? { kind: "collection", carrier: carrier! } : { kind: "index" };
      }
      emission = { ...common, kind: "access", read, indexType: parameter.type, conversion: undefined };
    }
    values.set(node, { ...classification, jsValue, target: selection, emission: Object.freeze(emission) });
  }
  return Object.freeze({ records: createCsharpElementAdmissionRecords(values), issues: Object.freeze(issues) });
}
