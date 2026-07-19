import {
  defineExtensionFactKey,
} from "@tsonic/tsts";
import {
  csharpTargetSemanticsExtensionId,
} from "../csharp-extension-identities.js";
import {
  csharpTargetIterationLoweringEquals,
  csharpTargetOperationFactEquals,
  csharpTypeParameterConstraintArrayEquals,
  extensionFactSubjectTypeRefEquals,
  objectShapeMemberArrayEquals,
  targetMemberEquals,
  targetTypeRefArrayEquals,
  targetTypeRefEquals,
} from "./equality.js";
import type {
  CsharpArrayBoundaryFact,
  CsharpArrayCarrierFact,
  CsharpAttributeApplicationFact,
  CsharpByrefStorageFact,
  CsharpJsonSerializableShapeFact,
  CsharpObjectShapeFact,
  CsharpObservedTargetAssignabilityFact,
  CsharpProjectSourceFact,
  CsharpSourceProfileDeclarationFact,
  CsharpRegularExpressionLiteralFact,
  CsharpPropagatedRuntimeCarrierFact,
  CsharpSelectedCallTargetFact,
  CsharpSourceReturnCarrierFact,
  CsharpTargetIterationFact,
  CsharpTargetNameFact,
  CsharpTargetOperationFact,
  CsharpTargetTypeParameterConstraintFact,
} from "./types.js";
import {
  snapshotCsharpArrayBoundaryFact,
  snapshotCsharpArrayCarrierFact,
  snapshotCsharpAttributeApplicationFact,
  snapshotCsharpByrefStorageFact,
  snapshotCsharpJsonSerializableShapeFact,
  snapshotCsharpObjectShapeFact,
  snapshotCsharpObservedTargetAssignabilityFact,
  snapshotCsharpProjectSourceFact,
  snapshotCsharpRegularExpressionLiteralFact,
  snapshotCsharpPropagatedRuntimeCarrierFact,
  snapshotCsharpSelectedCallTargetFact,
  snapshotCsharpSourceProfileDeclarationFact,
  snapshotCsharpSourceReturnCarrierFact,
  snapshotCsharpTargetIterationFact,
  snapshotCsharpTargetNameFact,
  snapshotCsharpTargetOperationFact,
  snapshotCsharpTargetTypeParameterConstraintFact,
} from "./snapshots.js";

export const csharpObjectShapeFactKey = defineExtensionFactKey<CsharpObjectShapeFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "objectShape",
  snapshot: snapshotCsharpObjectShapeFact,
  equals: (left, right) =>
    targetTypeRefEquals(left.targetType, right.targetType)
    && objectShapeMemberArrayEquals(left.members, right.members)
    && targetTypeRefArrayEquals(left.implements, right.implements)
    && left.constructible === right.constructible,
});

export const csharpJsonSerializableShapeFactKey = defineExtensionFactKey<CsharpJsonSerializableShapeFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "jsonSerializableShape",
  snapshot: snapshotCsharpJsonSerializableShapeFact,
  equals: (left, right) => left.kind === right.kind,
});

export const csharpTargetNameFactKey = defineExtensionFactKey<CsharpTargetNameFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "targetName",
  snapshot: snapshotCsharpTargetNameFact,
  equals: (left, right) => left.name === right.name,
});

export const csharpAttributeApplicationFactKey = defineExtensionFactKey<CsharpAttributeApplicationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "attributeApplication",
  snapshot: snapshotCsharpAttributeApplicationFact,
  equals: (left, right) =>
    left.attributeType === right.attributeType
    && left.attributeName === right.attributeName
    && (left.arguments ?? []).length === (right.arguments ?? []).length
    && (left.arguments ?? []).every((argument, index) => argument === (right.arguments ?? [])[index])
    && left.applicationTarget === right.applicationTarget
    && left.applicationPlacement === right.applicationPlacement
    && left.applicationParameterName === right.applicationParameterName
    && left.applicationTargetSpecifier === right.applicationTargetSpecifier,
});

export const csharpTargetTypeParameterConstraintFactKey = defineExtensionFactKey<CsharpTargetTypeParameterConstraintFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "typeParameterConstraint",
  snapshot: snapshotCsharpTargetTypeParameterConstraintFact,
  equals: (left, right) => csharpTypeParameterConstraintArrayEquals(left.constraints, right.constraints),
});

export const csharpObservedTargetAssignabilityFactKey = defineExtensionFactKey<CsharpObservedTargetAssignabilityFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "observedTargetAssignability",
  snapshot: snapshotCsharpObservedTargetAssignabilityFact,
  equals: (left, right) =>
    left.source === right.source
    && left.target === right.target
    && left.relation === right.relation
    && left.errorNode === right.errorNode
    && left.expression === right.expression,
});

export const csharpTargetIterationFactKey = defineExtensionFactKey<CsharpTargetIterationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "targetIteration",
  snapshot: snapshotCsharpTargetIterationFact,
  equals: (left, right) =>
    left.operationId === right.operationId
    && left.iterationKind === right.iterationKind
    && csharpTargetIterationLoweringEquals(left.lowering, right.lowering)
    && extensionFactSubjectTypeRefEquals(left.elementType, right.elementType),
});

export const csharpTargetOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "targetOperation",
  snapshot: snapshotCsharpTargetOperationFact,
  equals: csharpTargetOperationFactEquals,
});

export const csharpSelectedCallTargetFactKey = defineExtensionFactKey<CsharpSelectedCallTargetFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "selectedCallTarget",
  snapshot: snapshotCsharpSelectedCallTargetFact,
  equals: (left, right) => targetMemberEquals(left.member, right.member)
    && left.finalizationRequirement?.kind === right.finalizationRequirement?.kind
    && left.finalizationRequirement?.argumentIndex === right.finalizationRequirement?.argumentIndex
    && left.selectionFamily?.familyId === right.selectionFamily?.familyId
    && left.selectionFamily?.sourceIdentity === right.selectionFamily?.sourceIdentity
    && targetMemberArrayEquals(left.selectionFamily?.members, right.selectionFamily?.members),
});

function targetMemberArrayEquals(
  left: readonly CsharpSelectedCallTargetFact["member"][] | undefined,
  right: readonly CsharpSelectedCallTargetFact["member"][] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((member, index) => targetMemberEquals(member, right[index]));
}

export const csharpTargetMutationOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "targetMutationOperation",
  snapshot: snapshotCsharpTargetOperationFact,
  equals: csharpTargetOperationFactEquals,
});

export const csharpTargetConversionOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "targetConversionOperation",
  snapshot: snapshotCsharpTargetOperationFact,
  equals: csharpTargetOperationFactEquals,
});

export const csharpRegularExpressionLiteralFactKey = defineExtensionFactKey<CsharpRegularExpressionLiteralFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "regularExpressionLiteral",
  snapshot: snapshotCsharpRegularExpressionLiteralFact,
  equals: (left, right) => left.pattern === right.pattern && left.flags === right.flags,
});

export const csharpArrayCarrierFactKey = defineExtensionFactKey<CsharpArrayCarrierFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "arrayCarrier",
  snapshot: snapshotCsharpArrayCarrierFact,
  equals: (left, right) =>
    left.sourceKind === right.sourceKind &&
    left.lane === right.lane &&
    targetTypeRefEquals(left.elementType, right.elementType) &&
    targetTypeRefEquals(left.carrierType, right.carrierType) &&
    left.mutationVisibility === right.mutationVisibility &&
    left.boundary === right.boundary,
});

export const csharpArrayBoundaryFactKey = defineExtensionFactKey<CsharpArrayBoundaryFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "arrayBoundary",
  snapshot: snapshotCsharpArrayBoundaryFact,
  equals: (left, right) =>
    left.publicShape === right.publicShape &&
    targetTypeRefEquals(left.publicType, right.publicType) &&
    left.coreCarrierLane === right.coreCarrierLane &&
    targetTypeRefEquals(left.coreCarrierType, right.coreCarrierType) &&
    left.preservesMutationVisibility === right.preservesMutationVisibility &&
    left.requiresCopyIn === right.requiresCopyIn &&
    left.requiresCopyOut === right.requiresCopyOut,
});

export const csharpSourceReturnCarrierFactKey = defineExtensionFactKey<CsharpSourceReturnCarrierFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "sourceReturnCarrier",
  snapshot: snapshotCsharpSourceReturnCarrierFact,
  equals: (left, right) => targetTypeRefEquals(left.carrier, right.carrier),
});

export const csharpPropagatedRuntimeCarrierFactKey = defineExtensionFactKey<CsharpPropagatedRuntimeCarrierFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "propagatedRuntimeCarrier",
  snapshot: snapshotCsharpPropagatedRuntimeCarrierFact,
  equals: (left, right) => targetTypeRefEquals(left.carrier, right.carrier),
});

export const csharpProjectSourceFactKey = defineExtensionFactKey<CsharpProjectSourceFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "projectSource",
  snapshot: snapshotCsharpProjectSourceFact,
  equals: (left, right) => left.kind === right.kind,
});

export const csharpSourceProfileDeclarationFactKey = defineExtensionFactKey<CsharpSourceProfileDeclarationFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "sourceProfileDeclaration",
  snapshot: snapshotCsharpSourceProfileDeclarationFact,
  equals: (left, right) =>
    left.ownerId === right.ownerId &&
    left.kind === right.kind &&
    left.name === right.name &&
    left.declaringName === right.declaringName,
});

export const csharpByrefStorageFactKey = defineExtensionFactKey<CsharpByrefStorageFact>({
  extensionId: csharpTargetSemanticsExtensionId,
  name: "byrefStorage",
  snapshot: snapshotCsharpByrefStorageFact,
  equals: (left, right) => targetTypeRefEquals(left.targetType, right.targetType),
});
