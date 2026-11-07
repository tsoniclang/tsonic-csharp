import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import { resolveCsharpRuntimeUnionObjectShapeProperty } from "../objects/runtime-union-shapes.js";
import { optionalResultType } from "../../policy/operations/members/optional-results.js";
import type { Node } from "@tsonic/tsts";
import type { SourceElementAccessRecord, SourceMemberAccessSelection, SourceTypeDescriptor } from "@tsonic/target-api/source";
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
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";

import { classifyCsharpBoundFieldWrite } from "./bound-field-writes.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";

/**
 * A represented carrier used for a member-access projection. A CSHARP_ refusal of the same value is reported at the
 * value's own expression (its value read), so a projection over it is simply absent here.
 */
function carrier(representation: CsharpRepresentation): TargetTypeRef | undefined {
  return isCsharpRefusal(representation) ? undefined : representation;
}

/** The selected receiver type of a member or element access, represented at the receiver. */
function selectedReceiverCarrier(policy: CsharpPolicyContext, receiver: Node, receiverType: SourceTypeDescriptor): TargetTypeRef | undefined {
  return carrier(policy.types.represent(receiverType, receiver, "value"));
}

export function classifyCsharpMemberReceiver(
  policy: CsharpPolicyContext,
  source: { readonly receiver: Node; readonly receiverType: SourceTypeDescriptor; readonly optionalChain: boolean },
): CsharpMemberReceiverProjection | undefined {
  const raw = carrier(policy.types.value(source.receiver));
  const selected = selectedReceiverCarrier(policy, source.receiver, source.receiverType);
  const target = optionalResultType(selected, source.optionalChain);
  if (raw === undefined || target === undefined || targetTypeRefEquals(raw, target)) return undefined;
  return Object.freeze({ source: raw, target,
    conversion: admitCsharpConversionSelection(policy, raw, target, selectCsharpFlowReadConversion(policy, raw, target, isCsharpThrowableType(policy, target))) });
}

export function elementSelectedTypes(
  policy: CsharpPolicyContext,
  source: SourceElementAccessRecord,
  selection: CsharpTargetElementSelection | undefined,
): Pick<
  CsharpElementClassification,
  "receiverType" | "selectedResultType" | "flowReadConversion"
> {
  const receiverType = selectedReceiverCarrier(policy, source.receiver, source.receiverType);
  const selectedValueType = selection?.kind === "project-indexer"
    ? selection.selectedReadType ?? selection.valueType
    : receiverType?.kind === "tuple" && source.selected.kind === "tuple"
    ? receiverType.elements[source.selected.position]
    : receiverType?.kind === "array"
      ? receiverType.element
      : carrier(policy.types.represent(source.result, source.node, "value"));
  const selectedResultType = optionalResultType(
    selectedValueType,
    source.optionalChain,
  );
  const flowReadConversion = selection?.kind === "project-indexer" && source.access === "read" && selection.selectedReadType !== undefined
    ? admitCsharpConversionSelection(policy, selection.valueType, selection.selectedReadType,
        selectCsharpFlowReadConversion(policy, selection.valueType, selection.selectedReadType, isCsharpThrowableType(policy, selection.selectedReadType)))
    : undefined;
  return Object.freeze({
    ...(receiverType === undefined ? {} : { receiverType }),
    ...(selectedResultType === undefined ? {} : { selectedResultType }),
    ...(flowReadConversion === undefined ? {} : { flowReadConversion }),
  });
}

/** The declaration an element access selects (a member or an index signature), from the Host element-access record. */
function elementSelectedDeclaration(source: SourceElementAccessRecord): Node | undefined {
  return source.selected.kind === "member" || source.selected.kind === "index-signature" ? source.selected.declaration : undefined;
}

export function classifySourceOwnedElementMember(
  policy: CsharpPolicyContext,
  selection: CsharpTargetElementSelection | undefined,
): CsharpPropertyClassification["sourceOwned"] {
  const declaration = selection?.kind === "source-owned" ? elementSelectedDeclaration(selection.source) : undefined;
  const { ast } = policy;
  return selection?.kind === "source-owned" && declaration !== undefined && (
    ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration) ||
    ast.is.IsPropertyAssignment(declaration) || ast.is.IsShorthandPropertyAssignment(declaration) ||
    ast.is.IsMethodDeclaration(declaration) || ast.is.IsMethodSignatureDeclaration(declaration) ||
    ast.is.IsGetAccessorDeclaration(declaration) || ast.is.IsSetAccessorDeclaration(declaration) ||
    sourceParameterIsProperty(ast, declaration) || readCsharpSourceField(policy.sourceFacts, [declaration]) !== undefined
  ) ? classifySourceOwnedElement(policy, selection.source, declaration) : undefined;
}

export function classifySourceOwnedMember(
  policy: CsharpPolicyContext,
  selection: Extract<
    ReturnType<typeof selectCsharpTargetProperty>,
    { readonly kind: "source-owned" }
  >,
): NonNullable<CsharpPropertyClassification["sourceOwned"]> {
  const source = selection.source;
  const selectedSubjects: readonly Node[] = source.selected.kind === "member" ? source.selected.declarations : [source.selected.declaration];
  return classifySourceOwnedRead(policy, {
    use: source.use, receiver: source.receiver, receiverType: source.receiverType, result: source.result,
    optionalChain: source.optionalChain, callee: source.access === "call", selectedSubjects, selection: source,
  });
}

function classifySourceOwnedElement(
  policy: CsharpPolicyContext,
  source: SourceElementAccessRecord,
  declaration: Node,
): NonNullable<CsharpPropertyClassification["sourceOwned"]> {
  return classifySourceOwnedRead(policy, {
    use: source.node, receiver: source.receiver, receiverType: source.receiverType, result: source.result,
    optionalChain: source.optionalChain, callee: false, selectedSubjects: [declaration],
  });
}

/** A source-owned member read (property or element): receiver projection, object-shape member and read carriers. */
function classifySourceOwnedRead(
  policy: CsharpPolicyContext,
  read: {
    readonly use: Node; readonly receiver: Node; readonly receiverType: SourceTypeDescriptor; readonly result: SourceTypeDescriptor;
    readonly optionalChain: boolean; readonly callee: boolean; readonly selectedSubjects: readonly Node[];
    readonly selection?: SourceMemberAccessSelection;
  },
): NonNullable<CsharpPropertyClassification["sourceOwned"]> {
  const jsValueOperation = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverExpressionOperation(
    policy,
    read.receiver,
    "property-read",
    read.optionalChain,
  ));
  const selectedReceiverType = selectedReceiverCarrier(policy, read.receiver, read.receiverType);
  const objectShape = policy.projectTypes.catalog.definitionForTarget(selectedReceiverType)?.kind === "class"
    ? undefined
    : policy.objectShapes.resolveNode(read.receiver);
  const runtimeUnionProperty = resolveCsharpRuntimeUnionObjectShapeProperty(
    policy.objectShapes,
    selectedReceiverType,
    read.selectedSubjects,
    policy.typeDefinitions,
  );
  const shapeMember = objectShape === undefined
      ? undefined
      : resolveCsharpObjectShapeMemberBySelectedSubject(
          objectShape,
          read.selectedSubjects,
        );
  const storage = carrier(policy.types.readStorage(read.use));
  const rawMemberReadType = shapeMember?.kind === "resolved"
    ? jsValueOperation.kind === "resolved"
      ? jsValueOperation.resultType
      : shapeMember.member.type
    : storage;
  const optionalMethod = shapeMember?.kind === "resolved" && shapeMember.member.memberKind === "method" &&
    shapeMember.member.optional === true;
  const methodValueType = read.callee && !optionalMethod ? undefined : storage;
  const selectedMethodValue = getCsharpMethodValue(methodValueType) === undefined ? undefined : methodValueType;
  const rawReadType = optionalResultType(
    selectedMethodValue ?? rawMemberReadType,
    read.optionalChain,
  );
  // The published read result of the access (member or element selection), represented at the access.
  const selectedSourceReadType = carrier(policy.types.represent(read.result, read.use, "value"));
  const selectedMemberReadType = shapeMember?.kind === "resolved" && read.selection !== undefined
    ? resolveCsharpObjectShapeMemberReadTargetType(shapeMember.member, read.selection, selectedSourceReadType)
    : undefined;
  const selectedReadType = selectedMethodValue ?? (shapeMember?.kind === "resolved"
    ? optionalResultType(
        selectedMemberReadType,
        read.optionalChain,
      ) ?? selectedSourceReadType
    : selectedSourceReadType);
  const projectedWrite = classifyCsharpBoundFieldWrite(policy, read.use, rawMemberReadType);
  return Object.freeze({
    jsValueOperation,
    ...(objectShape === undefined ? {} : { objectShape }),
    selectedSubjects: Object.freeze([...read.selectedSubjects]),
    ...(selectedReceiverType === undefined ? {} : { selectedReceiverType }),
    runtimeUnionProperty,
    ...(shapeMember === undefined ? {} : { shapeMember }),
    ...(rawReadType === undefined ? {} : { rawReadType }),
    ...(selectedReadType === undefined ? {} : { selectedReadType }),
    ...(projectedWrite === undefined ? {} : { projectedWrite }),
  });
}
