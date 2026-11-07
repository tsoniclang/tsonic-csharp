// The C# realization check of every Host type-flow obligation (facts.obligations(), nextgen C-2542). The Host
// published each obligation (interface, read-only, constraint, literal admission, write fit); C# checks only that the
// chosen .NET representation carries it (policy/types/source-type-flow/obligations.ts). Inputs are published facts
// and the one representation; no checker Type is read (I2).
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorsEqual, type SourceObligation, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpDictionaryLiteralRecords } from "../../target-model/records/objects/dictionary-literals.js";
import type { TargetConstraint, TargetTypeRef } from "../../target-model/types/model.js";
import { checkCsharpSourceTypeFlowObligation } from "../../policy/types/source-type-flow/obligations.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpObjectShapesEqual } from "../../target-model/types/object-shape-equality.js";
import { isCsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";

const representedOrUndefined = (selected: CsharpRepresentation): TargetTypeRef | undefined =>
  isCsharpRefusal(selected) ? undefined : selected;

export function analyzeCsharpSourceTypeFlowObligations(
  policy: CsharpPolicyContext,
  objectShapes: CsharpObjectShapeClassifications,
  nativeConstruction: CsharpNativeConstructionDemandQueries,
  dictionaryLiterals: CsharpDictionaryLiteralRecords,
  compileTimeMetadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
): readonly TargetDiagnostic[] {
  const { facts, types } = policy;
  const issues: TargetDiagnostic[] = [];
  const represent = (descriptor: SourceTypeDescriptor, site: Node): TargetTypeRef | undefined =>
    representedOrUndefined(types.represent(descriptor, site, "storage"));
  const valueType = (node: Node): TargetTypeRef | undefined =>
    facts.values.has(node) ? representedOrUndefined(types.value(node)) : undefined;
  for (const obligation of facts.obligations()) {
    let subject: Node | undefined = obligation.site;
    while (subject !== undefined && compileTimeMetadata.get(subject) !== true) subject = policy.ast.parent(subject);
    if (subject !== undefined) continue;
    const issue = checkCsharpSourceTypeFlowObligation({
      providers: policy.providers,
      projectTypes: policy.projectTypes,
      target: policy.target,
      objectShapes,
      typeDefinitions: policy.typeDefinitions,
      constraintHost: policy,
      represent,
      literal: node => facts.values.literal(node),
      valueType,
      arrayLiteral: node => types.resolveArrayLiteral(node),
      literalAdmission(node, chosen) {
        const dictionary = dictionaryLiterals.dictionaryLiteral.get(node, chosen);
        if (dictionary !== undefined) return { kind: "resolved", type: dictionary.carrier };
        const issue = nativeConstruction.issues.find(issue => issue.node === node);
        if (issue !== undefined) return { kind: "rejected", subject: issue.node, code: issue.code, reason: issue.message };
        const selected = nativeConstruction.constructionFor(node);
        const outcome = facts.values.has(node) ? facts.values.type(node) : undefined;
        const descriptor = outcome === undefined || outcome.kind === "refused" ? undefined : outcome.construction ??
          (outcome.type.kind === "primitive" || outcome.type.kind === "string" || outcome.type.kind === "intrinsic" &&
            (outcome.type.intrinsic === "bigint" || outcome.type.intrinsic === "absence") ? outcome.type : undefined);
        const actual = selected?.targetType ?? (descriptor === undefined ? undefined : represent(descriptor, node));
        if (actual === undefined) return undefined;
        const conversion = selectCsharpConversion(policy, actual, chosen, "implicit");
        return csharpConversionIsApplicable(conversion, "implicit") ? { kind: "resolved", type: chosen }
          : conversion.kind === "rejected" ? { kind: "rejected", subject: node,
            code: conversion.code ?? "CSHARP_TYPE_FLOW_UNREPRESENTABLE", reason: conversion.reason } : undefined;
      },
      requiredType: selected => associatedParameter(policy, selected),
      nativeConstraints: (selected, chosen) => loweredNativeConstraints(policy, selected, chosen),
    }, obligation, retainedLiteralShape(policy, objectShapes, nativeConstruction, obligation));
    if (issue !== undefined) issues.push(issue);
  }
  return Object.freeze(issues);
}

/**
 * The physical carrier of an inferred object-literal admission (K-2664, WP0 A5, BF16 fix-forward): the literal is the
 * A5 initializer of its principal declaration (`provenance.principal`; never the solved group, an AST parent or the
 * literal itself), the literal and the principal are published in one file with exactly the obligation's descriptor,
 * and the literal's native construction is the carrier both of them read. The read owner (physical-reads.ts, composed
 * by `types.value`) has already proven that carrier: equal scoped storage, the BF16 canonical value storage of the
 * logical shape, and exact member origins and widths. The construction shape must be the registered shape of that
 * carrier. Any other case returns undefined and the obligation is checked against its logical representation with an
 * ordinary C# conversion proof (no waiver).
 */
function retainedLiteralShape(
  policy: CsharpPolicyContext,
  objectShapes: CsharpObjectShapeClassifications,
  nativeConstruction: CsharpNativeConstructionDemandQueries,
  obligation: SourceObligation,
): TargetTypeRef | undefined {
  const { facts, types } = policy;
  if (obligation.kind !== "literal-admission" || obligation.authority !== "inferred" || obligation.type.kind !== "shape") return undefined;
  const occurrence = obligation.value ?? obligation.site;
  if (!facts.values.has(occurrence)) return undefined;
  const current = facts.values.type(occurrence);
  if (current.kind === "refused" || current.provenance.occurrence !== occurrence) return undefined;
  const association = current.provenance.principal;
  const declaration = association?.declaration;
  if (declaration === undefined || declaration === occurrence || association?.initializer !== occurrence ||
    !facts.values.has(declaration)) return undefined;
  const principal = facts.values.type(declaration);
  if (principal.kind === "refused" || principal.provenance.occurrence !== declaration ||
    principal.provenance.sourceFile !== current.provenance.sourceFile ||
    !sourceTypeDescriptorsEqual(current.type, obligation.type) || !sourceTypeDescriptorsEqual(principal.type, obligation.type)) return undefined;
  const selected = nativeConstruction.constructionFor(occurrence);
  if (selected === undefined) return undefined;
  const selectedType = representedOrUndefined(types.value(occurrence));
  const storageType = representedOrUndefined(types.value(declaration));
  if (selectedType === undefined || storageType === undefined || !targetTypeRefEquals(selectedType, selected.targetType) ||
    !targetTypeRefEquals(storageType, selected.targetType)) return undefined;
  const registered = objectShapes.resolveTarget(selected.targetType);
  return registered !== undefined && targetTypeRefEquals(registered.targetType, selected.targetType) &&
    csharpObjectShapesEqual(registered, selected.shape) ? registered.targetType : undefined;
}

/** The instantiated call parameter an argument obligation names (selections.call parameters, after instantiation). */
function associatedParameter(policy: CsharpPolicyContext, obligation: SourceObligation): TargetTypeRef | undefined {
  const { facts, types, ast } = policy;
  if (obligation.call === undefined || obligation.parameter === undefined || obligation.argument === undefined) {
    return facts.values.has(obligation.required) ? representedOrUndefined(types.value(obligation.required)) : undefined;
  }
  if (obligation.required !== obligation.parameter && obligation.required !== ast.typeNode(obligation.parameter)) return undefined;
  const selection = facts.selections.call(obligation.call);
  if (selection === undefined || selection.kind === "refused") return undefined;
  const correspondence = selection.arguments.find(entry => entry.argument === obligation.argument);
  const parameter = correspondence === undefined ? undefined : selection.parameters[correspondence.parameterIndex];
  return parameter === undefined ? undefined : representedOrUndefined(types.represent(parameter.type, obligation.argument, "storage"));
}

/** The .NET constraints of the binder an obligation names, with the call's receiver and method binders substituted. */
function loweredNativeConstraints(
  policy: CsharpPolicyContext,
  obligation: SourceObligation,
  chosen: TargetTypeRef,
): readonly TargetConstraint[] | undefined {
  const { ast, facts, types } = policy;
  const node = obligation.required;
  const declaration = ast.is.IsTypeParameterDeclaration(node) ? node : ast.parent(node);
  if (declaration === undefined || !ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const parameter = csharpSourceTypeParameter(declaration, ast);
  if (parameter === undefined) return undefined;
  const resolution = types.typeParameterConstraints(declaration, parameter);
  if (resolution.kind !== "resolved") return undefined;
  const substitutions = new Map<string, TargetTypeRef>([[parameter.identity, chosen]]);
  const call = obligation.call;
  const instantiation = call === undefined ? undefined : facts.instantiations.at(call);
  if (instantiation?.kind === "refused") return undefined;
  for (const argument of instantiation === undefined || call === undefined ? [] : [...instantiation.receiver, ...instantiation.method]) {
    const binder = csharpSourceTypeParameter(argument.declaration, ast);
    const type = representedOrUndefined(types.represent(argument.type, call!, "type-argument"));
    if (binder === undefined || type === undefined) return undefined;
    substitutions.set(binder.identity, type);
  }
  const constraints: TargetConstraint[] = [];
  for (const constraint of resolution.constraints) {
    if (constraint.kind === "constructor") constraints.push(Object.freeze({ kind: "constructible" }));
    else if (constraint.kind === "type") {
      const contract = substituteTargetTypeParameters(constraint.type, substitutions);
      if (contract.kind !== "target-named") return undefined;
      constraints.push(Object.freeze({ kind: "implements", contract }));
    } else if (constraint.keyword === "class") constraints.push(Object.freeze({ kind: "reference-type" }));
    else if (constraint.keyword === "struct") constraints.push(Object.freeze({ kind: "value-type" }));
    else if (constraint.keyword === "unmanaged") constraints.push(Object.freeze({ kind: "unmanaged" }));
    else constraints.push(Object.freeze({ kind: "target-specific", target: "csharp", name: "notnull" }));
  }
  return Object.freeze(constraints);
}
