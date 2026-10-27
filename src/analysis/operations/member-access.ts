import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import { resolveCsharpRuntimeUnionObjectShapeProperty } from "../objects/runtime-union-shapes.js";
import { optionalResultType } from "../../policy/operations/members/optional-results.js";
import type { ResolvedSourceElementAccessInfo, SourceFile } from "@tsonic/tsts";
import { readCsharpSourceField } from "../../source/extension/markers.js";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpTargetElementSelection } from "../../target-model/records/operations/member-selections.js";
import { validateCsharpJsValueOperationSelection } from "../../policy/operations/js-values/selection.js";
import { selectCsharpTargetProperty } from "./members/selected-members.js";
import { selectCsharpJsValueReceiverExpressionOperation } from "./js-values.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../policy/types/index.js";
import { resolveCsharpObjectShapeMemberReadTargetType } from "./members/object-shape-members.js";
import { selectCsharpFlowReadConversion } from "../../policy/conversions/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpElementClassification, CsharpPropertyClassification, CsharpMemberReceiverProjection } from "../../target-model/records/operations/operations.js";

import { classifyCsharpBoundFieldWrite } from "./bound-field-writes.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";

export function classifyCsharpMemberReceiver(
  policy: CsharpPolicyContext,
  source: Pick<ResolvedSourceElementAccessInfo, "receiver" | "optionalChain">,
  sourceFile: SourceFile,
): CsharpMemberReceiverProjection | undefined {
  const raw = policy.types.resolveNode(source.receiver.expression, sourceFile)?.type;
  const selected = policy.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  const target = optionalResultType(selected, source.optionalChain);
  if (raw === undefined || target === undefined || targetTypeRefEquals(raw, target)) return undefined;
  return Object.freeze({ source: raw, target,
    conversion: admitCsharpConversionSelection(policy, raw, target, selectCsharpFlowReadConversion(policy, raw, target, isCsharpThrowableType(policy, target))) });
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
        selectCsharpFlowReadConversion(policy, selection.valueType, selection.selectedReadType, isCsharpThrowableType(policy, selection.selectedReadType)))
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
  const shapeMember = objectShape === undefined
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
    ? policy.types.resolveNode(selection.source.expression, sourceFile)?.type
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
    ...(shapeMember === undefined ? {} : { shapeMember }),
    ...(rawReadType === undefined ? {} : { rawReadType }),
    ...(selectedReadType === undefined ? {} : { selectedReadType }),
    ...(projectedWrite === undefined ? {} : { projectedWrite }),
  });
}
