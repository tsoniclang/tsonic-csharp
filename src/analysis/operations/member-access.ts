import type {
  ResolvedSourceElementAccessInfo,
  SourceFile,
} from "@tsonic/tsts";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
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
import type { CsharpPolicyContext } from "../../policy/context.js";
import type {
  CsharpElementClassification,
  CsharpPropertyClassification,
} from "./model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

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
  const jsValueOperation = selectCsharpJsValueReceiverExpressionOperation(
    policy,
    selection.source.receiver.expression,
    sourceFile,
    "property-read",
    selection.source.optionalChain,
  );
  const objectShape = policy.objectShapes.resolveNode(
    selection.source.receiver.expression,
    sourceFile,
  );
  const selectedSubjects = semantics.facts.selectedSubjects(
    selection.source.selectedSymbol,
    selection.source.selectedDeclaration,
  );
  const selectedReceiverType = policy.types.resolveSelectedValue(
    selection.source.receiver.expression,
    selection.source.receiver.type,
    sourceFile,
  );
  const runtimeUnionProperty = resolveCsharpRuntimeUnionObjectShapeProperty(
    policy.objectShapes,
    selectedReceiverType,
    selectedSubjects,
  );
  const jsValueProperty = resolveCsharpJsValueObjectShapeProperty(
    policy.objectShapes,
    semantics,
    selection,
    sourceFile,
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
  const rawReadType = optionalResultType(
    rawMemberReadType,
    selection.source.optionalChain,
  );
  const selectedSourceReadType = optionalResultType(
    policy.types.resolveSelectedResult(
      selection.source.selectedDeclaration,
      selection.source.sourceReadType,
      sourceFile,
    ),
    selection.source.optionalChain,
  );
  const selectedMemberReadType = shapeMember?.kind === "resolved"
    ? resolveCsharpObjectShapeMemberReadTargetType(
        shapeMember.member,
        selection.source.sourceReadType,
        (left, right) =>
          semantics.types.relationship(left, right) !== "unrelated",
      )
    : undefined;
  const selectedReadType = shapeMember?.kind === "resolved"
    ? optionalResultType(
        selectedMemberReadType,
        selection.source.optionalChain,
      ) ?? selectedSourceReadType
    : selectedSourceReadType ??
      policy.types.resolveNode(selection.source.expression, sourceFile);
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
