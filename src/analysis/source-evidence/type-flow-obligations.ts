import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceTypeFlowAssociation } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { TargetConstraint, TargetTypeRef } from "../../target-model/types/model.js";
import { checkCsharpSourceTypeFlowObligation } from "../../policy/types/source-type-flow/obligations.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { representCsharpSourceType } from "../../policy/types/source-type-flow/representation.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { selectCsharpScalarLiteralCarrier } from "../../policy/conversions/literals.js";

export function analyzeCsharpSourceTypeFlowObligations(
  policy: CsharpPolicyContext,
  objectShapes: CsharpObjectShapeClassifications,
  nativeConstruction: CsharpNativeConstructionDemandQueries,
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  for (const obligation of policy.effectiveTypes.obligations()) {
    const representation = policy.types.sourceTypeFlowRepresentation(obligation.value ?? obligation.site);
    const issue = checkCsharpSourceTypeFlowObligation({
      ...representation,
      providers: policy.providers,
      projectTypes: policy.projectTypes,
      objectShapes,
      literalValues: policy.literalValues,
      typeDefinitions: policy.typeDefinitions,
      constraintHost: policy,
      valueType(node) {
        const selected = policy.types.resolveNode(node, policy.ast.getSourceFile(node));
        return selected?.kind === "resolved" ? selected.sourceResult.selectedType : undefined;
      },
      literalAdmission(node, chosen) {
        const issue = nativeConstruction.issues.find(issue => issue.node === node);
        if (issue !== undefined) return { kind: "rejected", subject: issue.node, code: issue.code, reason: issue.message };
        const selected = nativeConstruction.constructionFor(node);
        const scalar = selectCsharpScalarLiteralCarrier(policy.literalValues.literalValue.get(node), chosen, policy.typeDefinitions);
        const actual = selected?.targetType ?? scalar;
        if (actual !== undefined) {
          const conversion = selectCsharpConversion(policy, actual, chosen, "implicit");
          return csharpConversionIsApplicable(conversion, "implicit") ? { kind: "resolved", type: chosen }
            : conversion.kind === "rejected" ? { kind: "rejected", subject: node,
              code: "CSHARP_UNSUPPORTED_AST", reason: conversion.reason } : undefined;
        }
        const result = policy.types.resolveNode(node, policy.ast.getSourceFile(node));
        return result?.kind === "rejected" ? result : result?.sourceResult.literalAdmission;
      },
      requiredType(node, association) {
        if (association?.binding !== undefined || association?.parameter !== undefined) return associatedParameter(policy, node, association);
        const result = policy.types.resolveNode(node, policy.ast.getSourceFile(node));
        return result?.kind === "resolved" ? result.sourceResult.selectedType : undefined;
      },
      nativeConstraints(node, type, association) {
        return loweredNativeConstraints(policy, node, type, association);
      },
    }, obligation);
    if (issue !== undefined) issues.push(issue);
  }
  return Object.freeze(issues);
}

function associatedParameter(
  policy: CsharpPolicyContext,
  node: Node,
  association: SourceTypeFlowAssociation | undefined,
): TargetTypeRef | undefined {
  if (association === undefined) return undefined;
  const call = association.call;
  const binding = association.binding;
  if (call === undefined || binding === undefined || association.parameter === undefined ||
    !call.sourceArgumentBindings.includes(binding) ||
    call.sourceSelectedSignatureParameters[binding.sourceParameterIndex] !== association.parameter ||
    node !== association.parameter.parameterDeclaration && node !== association.parameter.authoredTypeNode) return undefined;
  return policy.types.resolveSourceCallArgumentParameter(call, binding, association.sourceFile);
}

function loweredNativeConstraints(
  policy: CsharpPolicyContext,
  node: Node,
  chosen: TargetTypeRef,
  association: SourceTypeFlowAssociation | undefined,
): { readonly sourceFile: import("@tsonic/tsts").SourceFile; readonly constraints: readonly TargetConstraint[] } | undefined {
  const declaration = policy.ast.is.IsTypeParameterDeclaration(node) ? node : policy.ast.parent(node);
  if (declaration === undefined || !policy.ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const sourceFile = association?.sourceFile ?? policy.ast.getSourceFile(declaration);
  if (sourceFile === undefined || !policy.hasSemantics(sourceFile)) return undefined;
  const selected = policy.types.resolveNode(declaration, sourceFile);
  const parameter = selected?.kind === "resolved" ? selected.sourceResult.selectedType : undefined;
  if (parameter?.kind !== "type-parameter" || parameter.csharpDeclaration !== declaration ||
    parameter.csharpConstraints?.kind !== "resolved") return undefined;
  const substitutions = new Map<string, TargetTypeRef>([[parameter.identity, chosen]]);
  const call = association?.call;
  const instantiation = call === undefined ? undefined : policy.effectiveTypes.callInstantiation(call.call);
  if (instantiation !== undefined) {
    if (association === undefined || instantiation.call !== call) return undefined;
    for (const argument of [...instantiation.receiver, ...instantiation.method]) {
      const binder = csharpSourceTypeParameter(argument.declaration, policy.ast);
      const type = representCsharpSourceType(policy.types.sourceTypeFlowRepresentation(association.occurrence), argument.type);
      if (binder === undefined || type === undefined) return undefined;
      substitutions.set(binder.identity, type);
    }
  }
  const constraints: TargetConstraint[] = [];
  for (const constraint of parameter.csharpConstraints.constraints) {
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
  return Object.freeze({ sourceFile, constraints: Object.freeze(constraints) });
}
