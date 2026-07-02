import {
  defineExtensionFactKey,
} from "@tsonic/tsts";
import {
  csharpTargetIterationLoweringEquals,
  csharpTargetOperationFactEquals,
  csharpTypeParameterConstraintArrayEquals,
  extensionFactSubjectTypeRefEquals,
  objectShapeMemberArrayEquals,
  targetTypeRefArrayEquals,
  targetTypeRefEquals,
} from "./equality.js";
import type {
  CsharpArrayBoundaryFact,
  CsharpArrayCarrierFact,
  CsharpAttributeApplicationFact,
  CsharpObjectShapeFact,
  CsharpObservedTargetAssignabilityFact,
  CsharpRegularExpressionLiteralFact,
  CsharpSourceReturnCarrierFact,
  CsharpTargetIterationFact,
  CsharpTargetNameFact,
  CsharpTargetOperationFact,
  CsharpTargetTypeParameterConstraintFact,
} from "./types.js";

export const csharpObjectShapeFactKey = defineExtensionFactKey<CsharpObjectShapeFact>({
  extensionId: "tsonic.csharp",
  name: "objectShape",
  equals: (left, right) =>
    targetTypeRefEquals(left.targetType, right.targetType)
    && objectShapeMemberArrayEquals(left.members, right.members)
    && targetTypeRefArrayEquals(left.implements, right.implements)
    && left.constructible === right.constructible,
});

export const csharpTargetNameFactKey = defineExtensionFactKey<CsharpTargetNameFact>({
  extensionId: "tsonic.csharp",
  name: "targetName",
  equals: (left, right) => left.name === right.name,
});

export const csharpAttributeApplicationFactKey = defineExtensionFactKey<CsharpAttributeApplicationFact>({
  extensionId: "tsonic.csharp",
  name: "attributeApplication",
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
  extensionId: "tsonic.csharp",
  name: "typeParameterConstraint",
  equals: (left, right) => csharpTypeParameterConstraintArrayEquals(left.constraints, right.constraints),
});

export const csharpObservedTargetAssignabilityFactKey = defineExtensionFactKey<CsharpObservedTargetAssignabilityFact>({
  extensionId: "tsonic.csharp",
  name: "observedTargetAssignability",
  equals: (left, right) =>
    left.source === right.source
    && left.target === right.target
    && left.relation === right.relation
    && left.errorNode === right.errorNode
    && left.expression === right.expression,
});

export const csharpTargetIterationFactKey = defineExtensionFactKey<CsharpTargetIterationFact>({
  extensionId: "tsonic.csharp",
  name: "targetIteration",
  equals: (left, right) =>
    left.operationId === right.operationId
    && left.iterationKind === right.iterationKind
    && csharpTargetIterationLoweringEquals(left.lowering, right.lowering)
    && extensionFactSubjectTypeRefEquals(left.elementType, right.elementType),
});

export const csharpTargetOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: "tsonic.csharp",
  name: "targetOperation",
  equals: csharpTargetOperationFactEquals,
});

export const csharpTargetMutationOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: "tsonic.csharp",
  name: "targetMutationOperation",
  equals: csharpTargetOperationFactEquals,
});

export const csharpTargetConversionOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: "tsonic.csharp",
  name: "targetConversionOperation",
  equals: csharpTargetOperationFactEquals,
});

export const csharpRegularExpressionLiteralFactKey = defineExtensionFactKey<CsharpRegularExpressionLiteralFact>({
  extensionId: "tsonic.csharp",
  name: "regularExpressionLiteral",
  equals: (left, right) => left.pattern === right.pattern && left.flags === right.flags,
});

export const csharpArrayCarrierFactKey = defineExtensionFactKey<CsharpArrayCarrierFact>({
  extensionId: "tsonic.csharp",
  name: "arrayCarrier",
  equals: (left, right) =>
    left.sourceKind === right.sourceKind &&
    left.lane === right.lane &&
    targetTypeRefEquals(left.elementType, right.elementType) &&
    targetTypeRefEquals(left.carrierType, right.carrierType) &&
    left.mutationVisibility === right.mutationVisibility &&
    left.boundary === right.boundary,
});

export const csharpArrayBoundaryFactKey = defineExtensionFactKey<CsharpArrayBoundaryFact>({
  extensionId: "tsonic.csharp",
  name: "arrayBoundary",
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
  extensionId: "tsonic.csharp",
  name: "sourceReturnCarrier",
  equals: (left, right) => targetTypeRefEquals(left.carrier, right.carrier),
});
