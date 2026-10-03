import type {
  ResolvedSourceElementAccessInfo,
  SourceFile,
} from "@tsonic/tsts";
import { validateCsharpJsValueOperationSelection } from "../../policy/js-value-operations/selection.js";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../policy/operations/members/index.js";
import {
  selectCsharpJsValueReceiverExpressionOperation,
  selectCsharpJsValueReceiverOperation,
} from "../../policy/js-value-operations/index.js";
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
import type {
  CsharpElementClassification,
  CsharpPropertyClassification,
  CsharpMemberReceiverProjection,
} from "./model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { classifyCsharpBoundFieldWrite } from "./bound-field-writes.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function classifyCsharpMemberReceiver(
  policy: CsharpPolicyContext,
  source: Pick<ResolvedSourceElementAccessInfo, "receiver" | "optionalChain">,
  sourceFile: SourceFile,
): CsharpMemberReceiverProjection | undefined {
  const raw = policy.types.resolveNode(source.receiver.expression, sourceFile);
  const selected = policy.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  const target = optionalResultType(selected, source.optionalChain);
  if (raw === undefined || target === undefined || targetTypeRefEquals(raw, target)) return undefined;
  return Object.freeze({ source: raw, target, conversion: selectCsharpFlowReadConversion(policy, raw, target) });
}

export function elementSelectedTypes(
  policy: CsharpPolicyContext,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): Pick<
  CsharpElementClassification,
  "receiverType" | "selectedResultType" | "flowReadConversion"
> {
  const receiverType = policy.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const selectedValueType = receiverType?.kind === "tuple" &&
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
  const storageResultType = policy.types.resolveReadStorage(
    source.expression,
    sourceFile,
  );
  const flowReadConversion = selectedResultType === undefined ||
      storageResultType === undefined
    ? undefined
    : selectCsharpFlowReadConversion(
        policy,
        storageResultType,
        selectedResultType,
      );
  return Object.freeze({
    ...(receiverType === undefined ? {} : { receiverType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
    ...(flowReadConversion === undefined ? {} : { flowReadConversion }),
  });
}

export function classifySourceOwnedProperty(
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
