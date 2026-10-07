import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetPropertySelection, CsharpPropertyClassification } from "../../../../analysis/operations/index.js";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { targetPolicyDiagnostic, unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { translateCsharpJsValueInvocation } from "../js-value-operations.js";
import { planFlowReadUseSiteProjection } from "../flow-read-projections.js";
import { planCsharpSourceMemberName } from "./source-member-names.js";
import { getCsharpMethodValue } from "../../../../target-model/types/method-values.js";
import type { CsharpTargetNamedTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { planCsharpNativeUnionProjection } from "../union-projections.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { projectCsharpPlannedValue } from "../planned-value-composition.js";

export function translateCsharpSourceOwnedMember(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  classification: CsharpPropertyClassification["sourceOwned"],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue,
  conditional = selection.source.optionalChain,
): CsharpPlannedValue | undefined {
  if (classification === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_SOURCE_PROPERTY_CLASSIFICATION_MISSING",
      "A source-owned property has no sealed C# source-property classification.",
    ));
    return undefined;
  }
  const declaration = selection.source.selectedDeclaration;
  const {
    jsValueOperation,
    objectShape,
    runtimeUnionProperty,
    jsValueProperty,
    shapeMember,
    rawReadType,
    selectedReadType,
  } = classification;
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (runtimeUnionProperty.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      runtimeUnionProperty.reason,
    ));
    return undefined;
  }
  if (runtimeUnionProperty.kind === "resolved") {
    return translateRuntimeUnionObjectShapeProperty(
      node,
      selection,
      classification,
      runtimeUnionProperty,
      sourceFile,
      input,
      diagnostics,
      receiver,
      conditional,
    );
  }
  if (jsValueProperty.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueProperty.reason));
    return undefined;
  }
  if (objectShape !== undefined && shapeMember?.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property is absent from its finalized object-shape contract.",
    ));
    return undefined;
  }
  if (
    shapeMember?.kind !== "resolved" &&
    jsValueOperation.kind !== "resolved" &&
    (
      declaration === undefined ||
      !input.program.sourceNavigation.isProjectDeclaration(declaration)
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project.",
    ));
    return undefined;
  }
  const expression = input.program.source.ast.is.IsPropertyAccessExpression(node)
    ? input.program.source.ast.as.AsPropertyAccessExpression(node) : undefined;
  const syntaxName = expression?.name;
  const jsValueSourceName = jsValueProperty.kind === "resolved"
    ? jsValueProperty.member.sourceName
    : syntaxName === undefined
      ? undefined
      : input.program.source.ast.text(syntaxName);
  const methodValue = objectShape !== undefined && shapeMember?.kind === "resolved" &&
    shapeMember.member.memberKind === "method" && (!selection.source.callCallee || shapeMember.member.optional === true);
  const genericMethodValue = getCsharpMethodValue(rawReadType);
  const sourceProperty = declaration !== undefined && (
    input.program.source.ast.is.IsPropertyDeclaration(declaration) ||
    input.program.source.ast.is.IsPropertySignatureDeclaration(declaration) ||
    input.program.source.ast.is.IsGetAccessorDeclaration(declaration) ||
    sourceParameterIsProperty(input.program.source.ast, declaration)
  );
  if (genericMethodValue !== undefined && genericMethodValue.typeParameters.length > 0 &&
      !selection.source.callCallee && declaration !== undefined &&
      input.program.source.ast.is.IsMethodDeclaration(declaration) &&
      input.program.source.ast.is.IsClassDeclaration(input.program.source.ast.parent(declaration))) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "An extracted quantified nominal method has no supported native callable-value owner."));
    return undefined;
  }
  if (methodValue) {
    const required = input.artifacts.requireObjectShapeCapability(undefined, objectShape.targetType,
      sourceFile, "method-values", "object-shape");
    if (required.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, required.reason));
      return undefined;
    }
  }
  const resolvedName = jsValueOperation.kind === "resolved" ? undefined
    : planCsharpSourceMemberName(node, declaration, classification, methodValue, input, diagnostics);
  if (jsValueOperation.kind === "resolved" && jsValueSourceName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A JS-value property read requires an exact authored property name.",
    ));
    return undefined;
  }
  if (jsValueOperation.kind !== "resolved" && resolvedName === undefined) return undefined;
  if (genericMethodValue !== undefined && (sourceProperty ||
      shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "property")) {
    if (shapeMember?.kind === "resolved" &&
        (rawReadType === undefined || !targetTypeRefEquals(shapeMember.member.type, rawReadType))) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A stored generic method value lost its exact selected native storage type."));
      return undefined;
    }
  } else if (genericMethodValue !== undefined) {
    if (objectShape === undefined || shapeMember?.kind !== "resolved" ||
        genericMethodValue.method !== shapeMember.member.targetName ||
        !targetTypeRefEquals(genericMethodValue.owner, shapeMember.member.methodStorageType ??
          ((objectShape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
            (objectShape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface"
            ? shapeMember.member.methodValueContract ?? objectShape.targetType : objectShape.targetType))) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A generic method value lost its exact selected native owner."));
      return undefined;
    }
  }
  const planned = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value =>
    jsValueOperation.kind === "resolved" && jsValueSourceName !== undefined
    ? translateCsharpJsValueInvocation(
        input.scope.typeParameterNames,
        jsValueOperation,
        value,
        [{ kind: "LiteralExpression", value: jsValueSourceName }],
      )
    : resolvedName === undefined
    ? undefined
    : {
        kind: conditional
          ? "ConditionalAccessExpression"
          : "SimpleMemberAccessExpression" as const,
        receiver: value,
        name: resolvedName,
      } as CsharpExpression);
  if (planned === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected JS-value object-shape property read has no closed runtime operation.",
    ));
    return undefined;
  }
  if (
    selection.source.accessMode !== "read" ||
    selection.source.callCallee
  ) {
    return planned;
  }
  if (
    shapeMember?.kind !== "resolved" &&
    !sourceProperty
  ) {
    return planned;
  }
  if (shapeMember?.kind === "resolved" && selectedReadType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property read has no closed C# flow representation.",
    ));
    return undefined;
  }
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, planned, value => planFlowReadUseSiteProjection(
    node,
    value,
    sourceFile,
    input,
    diagnostics,
    {
      ...(rawReadType === undefined ? {} : { storageType: rawReadType }),
      ...(selectedReadType === undefined ? {} : { selectedType: selectedReadType }),
    },
  ));
}

function translateRuntimeUnionObjectShapeProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  classification: NonNullable<CsharpPropertyClassification["sourceOwned"]>,
  property: Extract<
    NonNullable<CsharpPropertyClassification["sourceOwned"]>["runtimeUnionProperty"],
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue,
  conditional = selection.source.optionalChain,
): CsharpPlannedValue | undefined {
  if (conditional) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Optional runtime-union object-shape property projection requires an explicit nullable-union policy.",
    ));
    return undefined;
  }
  const projected = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => planCsharpNativeUnionProjection(node, value, {
    unionCarrier: classification.selectedReceiverType!,
    selectedVariantIndexes: property.members.map(entry => entry.armIndex),
    variants: property.members.map(entry => ({ carrier: entry.armType, member: entry.member })),
  }, input, diagnostics, variant => variant.member,
  (payload, member) => ({ kind: "SimpleMemberAccessExpression", receiver: payload, name: member.targetName })), property.resultType);
  if (projected === undefined) return undefined;
  const selectedReadType = classification.selectedReadType;
  if (selectedReadType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact runtime-union object-shape property read has no closed C# selected result representation.",
    ));
    return undefined;
  }
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, projected, value => planFlowReadUseSiteProjection(
    node,
    value,
    sourceFile,
    input,
    diagnostics,
    {
      storageType: property.resultType,
      selectedType: selectedReadType,
    },
  ));
}
