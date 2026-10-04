import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTargetPropertySelection,
} from "../../../../analysis/operations/index.js";
import type {
  CsharpPropertyClassification,
} from "../../../../analysis/operations/index.js";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import {
  translateCsharpJsValueInvocation,
} from "../js-value-operations.js";
import {
  translateCsharpSelectedReceiver,
} from "../receivers.js";
import {
  planFlowReadUseSiteProjection,
} from "../flow-read-projections.js";
import { applyCsharpConversionSelection } from "../conversions.js";
import { planCsharpSourceMemberName } from "./source-member-names.js";
import { getCsharpMethodValue } from "../../../../target-model/types/method-values.js";
import type { CsharpTargetNamedTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpRecordOptionalRead } from "../../objects/indexed-records.js";
import { planCsharpUnionProperty } from "../union-properties.js";
import { planCsharpNativeUnionProjection } from "../union-projections.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { planCsharpExpressionCompletion, projectCsharpPlannedValue } from "../planned-value-composition.js";
import { planCsharpReceiverCallProperty } from "./receiver-call-property.js";

export function translateCsharpPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const classification = input.program.operations.property(node);
  if (classification === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_PROPERTY_CLASSIFICATION_MISSING",
      "C# planning received a property access without a sealed target classification.",
    ));
    return undefined;
  }
  const selection = classification.selection;
  switch (selection.kind) {
    case "union-property":
      return planCsharpUnionProperty(node, selection, sourceFile, input, diagnostics, planExpression);
    case "resolved":
      return translateSelectedProperty(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "source-owned":
      return translateSourceOwnedProperty(
        node,
        selection,
        classification.sourceOwned,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

function translateSelectedProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const member = selection.targetMember;
  if (selection.invocation.kind === "receiver-call") {
    return planCsharpReceiverCallProperty(node, selection, sourceFile, input, diagnostics, planExpression);
  }
  if (selection.invocation.kind === "source-name-indexer") {
    if (member.kind !== "indexer") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Checked source-name index access selected C# ${member.kind} '${member.id}'.`,
      ));
      return undefined;
    }
    if (selection.receiver.kind !== "instance") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "A source-name index access requires an exact instance receiver relation.",
      ));
      return undefined;
    }
    const access = input.program.source.ast.as.AsPropertyAccessExpression(node);
    const sourceName = access?.name;
    if (sourceName === undefined || !input.program.source.ast.is.IsIdentifier(sourceName)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "The exact selected source index signature has no authored identifier key.",
      ));
      return undefined;
    }
    const receiver = translateCsharpSelectedReceiver(
      selection.source.receiver,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      input.program.operations.property(node)?.receiverProjection,
    );
    if (receiver === undefined) {
      return undefined;
    }
    const key: CsharpExpression = { kind: "LiteralExpression", value: input.program.source.ast.text(sourceName) };
    if (selection.invocation.optionalRead) {
      return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => csharpRecordOptionalRead(value, key, selection.source.optionalChain,
        member.declaringType, member.returnType,
        `__tsonic_record_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`, input));
    }
    return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => ({
      kind: selection.source.optionalChain
        ? "ConditionalElementAccessExpression"
        : "ElementAccessExpression",
      receiver: value,
      arguments: [key],
    }));
  }
  if (
    member.kind !== "property" &&
    member.kind !== "field" &&
    member.kind !== "event"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Checked property access selected C# ${member.kind} '${member.id}'.`,
    ));
    return undefined;
  }
  if (selection.receiver.kind === "target-parameter") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A source property cannot lower to a target-parameter receiver without an explicit target invocation relation.",
    ));
    return undefined;
  }
  if (selection.receiver.kind === "none") {
    const receiver = targetStaticReceiver(input.scope.typeParameterNames, member, node, diagnostics);
    return receiver === undefined ? undefined : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      { kind: "SimpleMemberAccessExpression", receiver, name: member.targetName });
  }
  const receiver = translateCsharpSelectedReceiver(
        selection.source.receiver,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        input.program.operations.property(node)?.receiverProjection,
      );
  if (receiver === undefined) {
    return undefined;
  }
  const projection = selection.invocation.kind === "array-like" ? selection.invocation.projection : undefined;
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => {
    const selectedReceiver = projection === undefined ? value : applyCsharpConversionSelection(
      node, sourceFile, input, diagnostics, projection.source, projection.target, projection.conversion, value);
    return selectedReceiver === undefined ? undefined : {
    kind: selection.source.optionalChain
      ? "ConditionalAccessExpression"
      : "SimpleMemberAccessExpression",
    receiver: selectedReceiver,
    name: member.targetName,
    };
  });
}

function translateSourceOwnedProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  classification: CsharpPropertyClassification["sourceOwned"],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
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
      planExpression,
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
  const expression = input.program.source.ast.as.AsPropertyAccessExpression(node);
  const syntaxName = expression?.name;
  const jsValueSourceName = jsValueProperty.kind === "resolved"
    ? jsValueProperty.member.sourceName
    : syntaxName === undefined
      ? undefined
      : input.program.source.ast.text(syntaxName);
  const methodValue = objectShape !== undefined && shapeMember?.kind === "resolved" &&
    shapeMember.member.memberKind === "method" && (!selection.source.callCallee || shapeMember.member.optional === true);
  const genericMethodValue = getCsharpMethodValue(rawReadType);
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
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    input.program.operations.property(node)?.receiverProjection,
  );
  if (receiver === undefined) {
    return undefined;
  }
  if (genericMethodValue !== undefined && shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "property") {
    if (rawReadType === undefined || !targetTypeRefEquals(shapeMember.member.type, rawReadType)) {
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
        kind: selection.source.optionalChain
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
  const selectedDeclaration = selection.source.selectedDeclaration;
  if (
    shapeMember?.kind !== "resolved" &&
    (
      selectedDeclaration === undefined ||
      !input.program.source.ast.is.IsPropertyDeclaration(selectedDeclaration) &&
        !input.program.source.ast.is.IsPropertySignatureDeclaration(selectedDeclaration) &&
        !input.program.source.ast.is.IsGetAccessorDeclaration(selectedDeclaration)
    )
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
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (selection.source.optionalChain) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Optional runtime-union object-shape property projection requires an explicit nullable-union policy.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    input.program.operations.property(node)?.receiverProjection,
  );
  if (receiver === undefined) {
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

function targetStaticReceiver(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  member: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >["targetMember"],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const declaringType = member.declaringType;
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected static target property '${member.id}' has no declaring type.`,
    ));
    return undefined;
  }
  const receiver = csharpTypeFromTargetTypeRef(declaringType, typeParameterNames);
  if (receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected static target property '${member.id}' has no renderable declaring type.`,
    ));
  }
  return receiver;
}
