import type { AstReader, Node } from "@tsonic/tsts";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import { targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications, CsharpSourceOwnedMemberClassification } from "../../target-model/records/operations.js";
import type { CsharpTargetPropertySelection, CsharpTargetElementSelection } from "../../target-model/records/member-selections.js";
import type { CsharpAdmittedPropertyClassification, CsharpSourceMemberEmission, CsharpUnionPropertyProjection } from "../../target-model/records/property-admission.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpPropertyAdmissionRecords } from "../program/records/property-admission.js";
import { selectCsharpEmittedExpressions } from "../operations/emitted-expressions.js";

export function analyzeCsharpPropertyAdmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly admitted: (node: Node) => boolean;
  readonly projectDeclaration: (node: Node) => boolean;
  readonly jsCalls: import("../../target-model/records/js-value-calls.js").CsharpJsCallRecords;
  readonly receivers: import("../../target-model/records/member-receivers.js").CsharpMemberReceiverRecords;
  readonly modules: import("../../target-model/records/source-references.js").CsharpSourceReferenceRecords["sourceModuleReference"];
  readonly evidence: Pick<import("../../target-model/records/source-evidence.js").CsharpSourceEvidenceIndex, "sourceDefaultValue" | "sourceArgument"> }) {
  const properties = new Map<Node, CsharpAdmittedPropertyClassification>();
  const members = new Map<Node, CsharpSourceMemberEmission>();
  const unions = new Map<Node, CsharpUnionPropertyProjection>();
  const indexers = new Map<Node, string>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input;
  const refuse = (node: Node, message: string, code = "CSHARP_UNSUPPORTED_AST", evidence: readonly string[] = []): void => {
    issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message,
      ...(evidence.length === 0 ? {} : { evidence }) });
  };
  const admitMember = (node: Node, selection: Extract<CsharpTargetPropertySelection | CsharpTargetElementSelection, { readonly kind: "source-owned" }>,
    classification: CsharpSourceOwnedMemberClassification | undefined): void => {
    if (classification === undefined) { refuse(node, "A source-owned property has no sealed C# source-property classification.", "CSHARP_SOURCE_PROPERTY_CLASSIFICATION_MISSING"); return; }
    const { jsValueOperation, objectShape, runtimeUnionProperty, jsValueProperty, shapeMember, rawReadType, selectedReadType } = classification;
    if (jsValueOperation.kind === "rejected") { refuse(node, jsValueOperation.reason); return; }
    if (runtimeUnionProperty.kind === "rejected") { refuse(node, runtimeUnionProperty.reason); return; }
    if (runtimeUnionProperty.kind === "resolved") {
      if (ast.is.IsPropertyAccessExpression(node) && selection.source.optionalChain) {
        refuse(node, "Optional runtime-union object-shape property projection requires an explicit nullable-union policy."); return;
      }
      if (classification.selectedReceiverType === undefined || selectedReadType === undefined) {
        refuse(node, "The exact runtime-union object-shape property read has no closed C# selected result representation."); return;
      }
      unions.set(node, { unionCarrier: classification.selectedReceiverType, resultCarrier: runtimeUnionProperty.resultType,
        variants: Object.freeze(runtimeUnionProperty.members.map(entry => Object.freeze({ index: entry.armIndex, carrier: entry.armType, memberName: entry.member.targetName }))) });
      members.set(node, { kind: "union", flow: true });
      return;
    }
    if (jsValueProperty.kind === "rejected") { refuse(node, jsValueProperty.reason); return; }
    if (objectShape !== undefined && shapeMember?.kind !== "resolved") {
      refuse(node, "The exact selected source property is absent from its finalized object-shape contract."); return;
    }
    const declaration = selection.source.selectedDeclaration;
    if (shapeMember?.kind !== "resolved" && jsValueOperation.kind !== "resolved" &&
      (declaration === undefined || !input.projectDeclaration(declaration))) {
      refuse(node, "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project."); return;
    }
    // An object-shape method read that is not its call reads the stored method value through its per-method accessor
    // (native demand requests that accessor for exactly these reads), so copies and comparisons see one delegate; a
    // method group would create a new delegate per read. Optional methods are always read from storage.
    const methodValue = objectShape !== undefined && shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "method" &&
      (shapeMember.member.optional === true || !selection.source.callCallee);
    const generic = getCsharpMethodValue(rawReadType);
    const sourceProperty = declaration !== undefined && (ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration) ||
      ast.is.IsGetAccessorDeclaration(declaration) || sourceParameterIsProperty(ast, declaration));
    if (generic !== undefined && generic.typeParameters.length > 0 && !selection.source.callCallee && declaration !== undefined &&
      ast.is.IsMethodDeclaration(declaration) && ast.is.IsClassDeclaration(ast.parent(declaration))) {
      refuse(node, "An extracted quantified nominal method has no supported native callable-value owner."); return;
    }
    if (generic !== undefined && (sourceProperty || shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "property")) {
      if (shapeMember?.kind === "resolved" && (rawReadType === undefined || !targetTypeRefEquals(shapeMember.member.type, rawReadType))) {
        refuse(node, "A stored generic method value lost its exact selected native storage type."); return;
      }
    } else if (generic !== undefined) {
      const owner = objectShape?.targetType as CsharpTargetNamedTypeRef | undefined;
      if (objectShape === undefined || shapeMember?.kind !== "resolved" || generic.method !== shapeMember.member.targetName ||
        !targetTypeRefEquals(generic.owner, shapeMember.member.methodStorageType ??
          (owner?.csharpStructuralContract === true || owner?.csharpSourceDeclarationKind === "interface"
            ? shapeMember.member.methodValueContract ?? objectShape.targetType : objectShape.targetType))) {
        refuse(node, "A generic method value lost its exact selected native owner."); return;
      }
    }
    const flow = selection.source.accessMode === "read" && !selection.source.callCallee && (shapeMember?.kind === "resolved" || sourceProperty);
    if (flow && shapeMember?.kind === "resolved" && selectedReadType === undefined) {
      refuse(node, "The exact selected source property read has no closed C# flow representation."); return;
    }
    if (jsValueOperation.kind === "resolved") {
      const syntax = ast.as.AsPropertyAccessExpression(node)?.name;
      const name = jsValueProperty.kind === "resolved" ? jsValueProperty.member.sourceName : syntax === undefined ? undefined : ast.text(syntax);
      if (name === undefined) { refuse(node, "A JS-value property read requires an exact authored property name."); return; }
      members.set(node, { kind: "js-value", name, operation: jsValueOperation, flow });
    } else members.set(node, { kind: "member", methodValue, flow,
      static: input.receivers.memberReceiver.get(selection.source.receiver.expression, selection.source.receiver.valueDeclaration)?.kind === "type" });
  };
  const required = selectCsharpEmittedExpressions(input);
  for (const node of required) {
    const element = input.operations.selectedElement.get(node);
    if (element?.target?.kind === "source-owned" && element.sourceOwned !== undefined) admitMember(node, element.target, element.sourceOwned);
    if (!ast.is.IsPropertyAccessExpression(node) || input.modules.get(node) !== undefined) continue;
    const classification = input.operations.selectedProperty.get(node);
    if (classification === undefined) { refuse(node, "C# planning received a property access without a sealed target classification.", "CSHARP_TARGET_PROPERTY_CLASSIFICATION_MISSING"); continue; }
    const selection = classification.selection;
    switch (selection.kind) {
      case "source-owned": admitMember(node, selection, classification.sourceOwned); properties.set(node, { ...classification, selection }); break;
      case "union-property": {
        const variants: CsharpUnionPropertyProjection["variants"][number][] = [];
        for (const index of selection.selectedVariantIndexes) {
          const variant = selection.variants[index];
          if (variant?.operation === undefined) { refuse(node, "An admitted union projection requires its selected arm operation."); break; }
          variants.push(Object.freeze({ index, carrier: variant.carrier, memberName: variant.operation.targetMember.targetName }));
        }
        if (variants.length !== selection.selectedVariantIndexes.length) break;
        unions.set(node, { unionCarrier: selection.unionCarrier, resultCarrier: selection.resultCarrier, variants: Object.freeze(variants) });
        properties.set(node, { ...classification, selection });
        break;
      }
      case "resolved": {
        const member = selection.targetMember;
        if (selection.invocation.kind === "receiver-call") { properties.set(node, { ...classification, selection }); break; }
        if (selection.invocation.kind === "source-name-indexer") {
          const name = ast.as.AsPropertyAccessExpression(node)?.name;
          if (member.kind !== "indexer") { refuse(node, `Checked source-name index access selected C# ${member.kind} '${member.id}'.`); break; }
          if (selection.receiver.kind !== "instance") { refuse(node, "A source-name index access requires an exact instance receiver relation."); break; }
          if (name === undefined || !ast.is.IsIdentifier(name)) { refuse(node, "The exact selected source index signature has no authored identifier key."); break; }
          indexers.set(node, ast.text(name));
        } else {
          if (member.kind !== "property" && member.kind !== "field" && member.kind !== "event") { refuse(node, `Checked property access selected C# ${member.kind} '${member.id}'.`); break; }
          if (selection.receiver.kind === "target-parameter") { refuse(node, "A source property cannot lower to a target-parameter receiver without an explicit target invocation relation."); break; }
          if (selection.receiver.kind === "none") {
            if (member.declaringType === undefined) { refuse(node, `Selected static target property '${member.id}' has no declaring type.`); break; }
            if (!selectCsharpTypeEmission({ carrier: member.declaringType })) { refuse(node, `Selected static target property '${member.id}' has no renderable declaring type.`); break; }
          }
        }
        properties.set(node, { ...classification, selection });
        break;
      }
      case "rejected": issues.push(targetDiagnosticFromExtension(node, selection.diagnostic)); break;
      case "missing": refuse(node, selection.reason, "CSHARP_TARGET_PROPERTY_NOT_CLOSED"); break;
      case "conflict": refuse(node, selection.reason, "CSHARP_TARGET_PROPERTY_IDENTITY_CONFLICT"); break;
      case "ambiguous": refuse(node, selection.reason, "CSHARP_TARGET_PROPERTY_AMBIGUOUS", selection.candidates.map(candidate => `candidate=${candidate}`)); break;
    }
  }
  return Object.freeze({ records: createCsharpPropertyAdmissionRecords({ properties, members, unions, indexers }), issues: Object.freeze(issues) });
}
