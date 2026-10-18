import type {
  AstReader,
  Node,
  ResolvedSourceElementAccessInfo,
  SourceFile,
} from "@tsonic/tsts";
import { readCsharpSourceField } from "../../policy/types/resolution/source-markers.js";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpTargetElementSelection } from "../../target-model/records/member-selections.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../policy/operations/members/index.js";
import {
  selectCsharpJsValueReceiverExpressionOperation,
  selectCsharpJsValueReceiverOperation,
} from "../../policy/operations/js-values/index.js";
import {
  csharpNullableTargetType,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
  resolveCsharpRuntimeUnionObjectShapeProperty,
} from "../../policy/types/index.js";
import {
  selectCsharpFlowReadConversion,
} from "../../policy/conversions/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpElementClassification, CsharpPropertyClassification, CsharpMemberReceiverProjection } from "../../target-model/records/operations.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { classifyCsharpBoundFieldWrite } from "./bound-field-writes.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import type { CsharpNativeSourceMemberRead } from "../../policy/operations/control-flow/native-operands.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { TargetPlanningSourceNavigation } from "@tsonic/target-api/analysis";

export type CsharpSourceMemberAdmission =
  | { readonly kind: "resolved" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "pending"; readonly reason: string };

export function admitCsharpSourceOwnedMemberRead(
  input: { readonly ast: AstReader; readonly names: Pick<CsharpNamePlan, "resolve">;
    readonly navigation: Pick<TargetPlanningSourceNavigation, "isProjectDeclaration"> },
  node: Node,
  selected: CsharpNativeSourceMemberRead,
): CsharpSourceMemberAdmission {
  const { classification, selection } = selected;
  if (classification === undefined) return { kind: "pending", reason: "A source-owned property has no sealed C# source-property classification." };
  const { jsValueOperation, objectShape, runtimeUnionProperty, jsValueProperty, shapeMember, rawReadType, selectedReadType } = classification;
  if (jsValueOperation.kind === "rejected") return jsValueOperation;
  if (runtimeUnionProperty.kind === "rejected") return runtimeUnionProperty;
  if (runtimeUnionProperty.kind === "resolved") {
    if (selection.source.optionalChain) return { kind: "rejected",
      reason: "Optional runtime-union object-shape property projection requires an explicit nullable-union policy." };
    if (selectedReadType === undefined || classification.selectedReceiverType === undefined) return { kind: "pending",
      reason: "The exact runtime-union object-shape property read has no closed C# selected result representation." };
    return { kind: "resolved" };
  }
  if (jsValueProperty.kind === "rejected") return jsValueProperty;
  if (objectShape !== undefined && shapeMember?.kind !== "resolved") return { kind: "rejected",
    reason: "The exact selected source property is absent from its finalized object-shape contract." };
  const declaration = selection.source.selectedDeclaration;
  if (shapeMember?.kind !== "resolved" && jsValueOperation.kind !== "resolved" &&
    (declaration === undefined || !input.navigation.isProjectDeclaration(declaration))) return { kind: "rejected",
      reason: "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project." };
  const methodValue = objectShape !== undefined && shapeMember?.kind === "resolved" &&
    shapeMember.member.memberKind === "method" && (!selection.source.callCallee || shapeMember.member.optional === true);
  const genericMethodValue = getCsharpMethodValue(rawReadType);
  const sourceProperty = declaration !== undefined && (input.ast.is.IsPropertyDeclaration(declaration) ||
    input.ast.is.IsPropertySignatureDeclaration(declaration) || input.ast.is.IsGetAccessorDeclaration(declaration) ||
    sourceParameterIsProperty(input.ast, declaration));
  if (genericMethodValue !== undefined && genericMethodValue.typeParameters.length > 0 && !selection.source.callCallee &&
    declaration !== undefined && input.ast.is.IsMethodDeclaration(declaration) &&
    input.ast.is.IsClassDeclaration(input.ast.parent(declaration))) return { kind: "rejected",
      reason: "An extracted quantified nominal method has no supported native callable-value owner." };
  if (jsValueOperation.kind === "resolved") {
    const nameNode = input.ast.as.AsPropertyAccessExpression(node)?.name;
    if (jsValueProperty.kind !== "resolved" && (nameNode === undefined || input.ast.text(nameNode) === undefined)) {
      return { kind: "pending", reason: "A JS-value property read requires an exact authored property name." };
    }
  } else if (shapeMember?.kind !== "resolved") {
    const nameNode = input.ast.name(declaration) ?? input.ast.as.AsPropertyAccessExpression(node)?.name;
    const name = input.names.resolve(nameNode, declaration);
    if (name.kind === "rejected") return { kind: "rejected",
      reason: `The exact selected source property has no C#-representable declaration name. ${name.reason}` };
  } else if (methodValue && (objectShape === undefined || !objectShape.members.includes(shapeMember.member))) {
    return { kind: "pending", reason: "A stored source method requires its exact native object shape." };
  }
  if (genericMethodValue !== undefined && (sourceProperty || shapeMember?.kind === "resolved" &&
    shapeMember.member.memberKind === "property")) {
    if (shapeMember?.kind === "resolved" && (rawReadType === undefined || !targetTypeRefEquals(shapeMember.member.type, rawReadType))) {
      return { kind: "pending", reason: "A stored generic method value lost its exact selected native storage type." };
    }
  } else if (genericMethodValue !== undefined) {
    if (objectShape === undefined || shapeMember?.kind !== "resolved") return { kind: "pending",
      reason: "A generic method value lost its exact selected native owner." };
    const target = objectShape.targetType;
    const named: CsharpTargetNamedTypeRef | undefined = target.kind === "target-named" ? target : undefined;
    const structural = named !== undefined && (named.csharpStructuralContract === true || named.csharpSourceDeclarationKind === "interface");
    const owner = shapeMember.member.methodStorageType ?? (structural ? shapeMember.member.methodValueContract ?? target : target);
    if (genericMethodValue.method !== shapeMember.member.targetName || !targetTypeRefEquals(genericMethodValue.owner, owner)) {
      return { kind: "pending", reason: "A generic method value lost its exact selected native owner." };
    }
  }
  if (selection.source.accessMode === "read" && !selection.source.callCallee && shapeMember?.kind === "resolved" && selectedReadType === undefined) {
    return { kind: "pending", reason: "The exact selected source property read has no closed C# flow representation." };
  }
  return { kind: "resolved" };
}

export function classifyCsharpMemberReceiver(
  policy: CsharpPolicyContext,
  source: Pick<ResolvedSourceElementAccessInfo, "receiver" | "optionalChain">,
  sourceFile: SourceFile,
): CsharpMemberReceiverProjection | undefined {
  const raw = policy.types.resolveNode(source.receiver.expression, sourceFile);
  const selected = policy.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  const target = optionalResultType(selected, source.optionalChain);
  if (raw === undefined || target === undefined || targetTypeRefEquals(raw, target)) return undefined;
  return Object.freeze({ source: raw, target,
    conversion: admitCsharpConversionSelection(policy, raw, target, selectCsharpFlowReadConversion(policy, raw, target)) });
}

export function elementSelectedTypes(
  policy: CsharpPolicyContext,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
  selection: CsharpTargetElementSelection | undefined,
): Pick<
  CsharpElementClassification,
  "receiverType" | "selectedResultType" | "flowReadConversion"
> {
  const receiverType = policy.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const selectedValueType = selection?.kind === "project-indexer"
    ? selection.selectedReadType ?? selection.valueType
    : receiverType?.kind === "tuple" &&
      source.selectedElementIndex !== undefined
    ? receiverType.elements[source.selectedElementIndex]
    : receiverType?.kind === "array"
      ? receiverType.element
      : policy.types.resolveSelectedResult(
          source.selectedDeclaration,
          source.sourceReadType ?? source.sourceWriteType,
          sourceFile,
        );
  const selectedResultType = optionalResultType(
    selectedValueType,
    source.optionalChain,
  );
  const flowReadConversion = selection?.kind === "project-indexer" && source.accessMode === "read" && selection.selectedReadType !== undefined
    ? admitCsharpConversionSelection(policy, selection.valueType, selection.selectedReadType,
        selectCsharpFlowReadConversion(policy, selection.valueType, selection.selectedReadType))
    : undefined;
  return Object.freeze({
    ...(receiverType === undefined ? {} : { receiverType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
    ...(flowReadConversion === undefined ? {} : { flowReadConversion }),
  });
}

export function classifySourceOwnedElementMember(
  policy: CsharpPolicyContext,
  selection: CsharpTargetElementSelection | undefined,
  sourceFile: SourceFile,
): CsharpPropertyClassification["sourceOwned"] {
  const declaration = selection?.kind === "source-owned" ? selection.source.selectedDeclaration : undefined;
  const { ast } = policy;
  return selection?.kind === "source-owned" && declaration !== undefined && (
    ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration) ||
    ast.is.IsPropertyAssignment(declaration) || ast.is.IsShorthandPropertyAssignment(declaration) ||
    ast.is.IsMethodDeclaration(declaration) || ast.is.IsMethodSignatureDeclaration(declaration) ||
    ast.is.IsGetAccessorDeclaration(declaration) || ast.is.IsSetAccessorDeclaration(declaration) ||
    sourceParameterIsProperty(ast, declaration) || readCsharpSourceField(policy.sourceFacts, [declaration]) !== undefined
  ) ? classifySourceOwnedMember(policy, selection, sourceFile) : undefined;
}

export function classifySourceOwnedMember(
  policy: CsharpPolicyContext,
  selection: Extract<
    ReturnType<typeof selectCsharpTargetProperty>,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
): NonNullable<CsharpPropertyClassification["sourceOwned"]> {
  const semantics = policy.semantics(sourceFile);
  const jsValueOperation = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverExpressionOperation(
    policy,
    selection.source.receiver.expression,
    sourceFile,
    "property-read",
    selection.source.optionalChain,
  ));
  const selectedSubjects = semantics.facts.selectedSubjects(
    selection.source.selectedSymbol,
    selection.source.selectedDeclaration,
  );
  const selectedReceiverType = policy.types.resolveSelectedValue(
    selection.source.receiver.expression,
    selection.source.receiver.type,
    sourceFile,
  );
  const objectShape = policy.projectTypes.catalog.definitionForTarget(selectedReceiverType)?.kind === "class"
    ? undefined
    : policy.objectShapes.resolveNode(selection.source.receiver.expression, sourceFile);
  const runtimeUnionProperty = resolveCsharpRuntimeUnionObjectShapeProperty(
    policy.objectShapes,
    selectedReceiverType,
    selectedSubjects,
    policy.typeDefinitions,
  );
  const jsValueProperty = resolveCsharpJsValueObjectShapeProperty(
    objectShape,
    selectedSubjects,
  );
  const shapeMember = jsValueProperty.kind === "resolved"
    ? {
        kind: "resolved" as const,
        member: jsValueProperty.member,
        evidence: Object.freeze([
          "Object-shape member resolved from exact checked JS-value property evidence.",
        ]),
      }
    : objectShape === undefined
      ? undefined
      : resolveCsharpObjectShapeMemberBySelectedSubject(
          objectShape,
          selectedSubjects,
        );
  const rawMemberReadType = shapeMember?.kind === "resolved"
    ? jsValueOperation.kind === "resolved"
      ? jsValueOperation.resultType
      : shapeMember.member.type
    : policy.types.resolveReadStorage(selection.source.expression, sourceFile);
  const optionalMethod = shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "method" &&
    shapeMember.member.optional === true;
  const methodValueType = selection.source.callCallee && !optionalMethod ? undefined
    : policy.types.resolveReadStorage(selection.source.expression, sourceFile);
  const selectedMethodValue = getCsharpMethodValue(methodValueType) === undefined ? undefined : methodValueType;
  const rawReadType = optionalResultType(
    selectedMethodValue ?? rawMemberReadType,
    selection.source.optionalChain,
  );
  const selectedSourceReadType = selection.source.sourceReadType === undefined
    ? policy.types.resolveNode(selection.source.expression, sourceFile)
    : policy.types.resolveSelectedValue(
      selection.source.expression,
      selection.source.sourceReadType,
      sourceFile,
    );
  const selectedMemberReadType = shapeMember?.kind === "resolved"
    ? resolveCsharpObjectShapeMemberReadTargetType(
        shapeMember.member,
        selection.source.sourceReadType,
        (left, right) =>
          semantics.types.relationship(left, right) !== "unrelated",
        selectedSourceReadType,
      )
    : undefined;
  const selectedReadType = selectedMethodValue ?? (shapeMember?.kind === "resolved"
    ? optionalResultType(
        selectedMemberReadType,
        selection.source.optionalChain,
      ) ?? selectedSourceReadType
    : selectedSourceReadType);
  const projectedWrite = classifyCsharpBoundFieldWrite(
    policy, selection.source.expression, sourceFile, rawMemberReadType,
  );
  return Object.freeze({
    jsValueOperation,
    ...(objectShape === undefined ? {} : { objectShape }),
    selectedSubjects: Object.freeze([...selectedSubjects]),
    ...(selectedReceiverType === undefined ? {} : { selectedReceiverType }),
    runtimeUnionProperty,
    jsValueProperty,
    ...(shapeMember === undefined ? {} : { shapeMember }),
    ...(rawReadType === undefined ? {} : { rawReadType }),
    ...(selectedReadType === undefined ? {} : { selectedReadType }),
    ...(projectedWrite === undefined ? {} : { projectedWrite }),
    jsValuePropertyWrite: selectCsharpJsValueReceiverOperation(
      jsValueProperty.kind === "resolved"
        ? jsValueProperty.shape.targetType
        : undefined,
      "property-write",
      selection.source.optionalChain,
    ),
  });
}

export function optionalResultType(
  type: TargetTypeRef | undefined,
  optional: boolean,
): TargetTypeRef | undefined {
  return type === undefined || !optional
    ? type
    : csharpNullableTargetType(type);
}
