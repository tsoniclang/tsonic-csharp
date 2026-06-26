import { defineExtensionFactKey } from "@tsonic/tsts";
import type { ExtensionEvidence, ExtensionFactSubject, TargetConstraint, TargetMember, TargetOperationFact, TargetTypeRef } from "@tsonic/tsts";
import {
  csharpTargetIterationLoweringEquals,
  csharpTargetOperationFactEquals,
  csharpTypeParameterConstraintArrayEquals,
  extensionFactSubjectTypeRefEquals,
  objectShapeMemberArrayEquals,
  targetTypeRefArrayEquals,
  targetTypeRefEquals,
} from "./csharp-facts/equality.js";

export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export const CsharpTargetOperatorOperation = {
  typeTest: "type-test",
} as const;

export type CsharpTargetOperatorOperation = typeof CsharpTargetOperatorOperation[keyof typeof CsharpTargetOperatorOperation];

export const csharpSourceOwnedPropertyOperationPrefix = "tsonic.csharp.source.property:";

export function isCsharpSourceOwnedPropertyOperation(operation: TargetOperationFact | undefined): boolean {
  return operation?.operationKind === "property" &&
    operation.operationId.startsWith(csharpSourceOwnedPropertyOperationPrefix);
}

export interface CsharpObjectShapeMemberFact {
  readonly sourceName: string;
  readonly targetName: string;
  readonly memberKind: "property" | "method";
  readonly type: TargetTypeRef;
  readonly optional?: boolean;
  readonly readonly?: boolean;
}

export interface CsharpObjectShapeFact {
  readonly targetType: TargetTypeRef;
  readonly members: readonly CsharpObjectShapeMemberFact[];
  readonly implements?: readonly TargetTypeRef[];
  readonly constructible?: boolean;
}

export interface CsharpTargetNameFact {
  readonly name: string;
}

export type CsharpTypeParameterConstraint =
  | TargetConstraint
  | CsharpExplicitTypeParameterConstraint
  | CsharpKeywordTypeParameterConstraint
  | CsharpConstructorTypeParameterConstraint;

export interface CsharpExplicitTypeParameterConstraint {
  readonly kind: "csharp-type";
  readonly type: TargetTypeRef;
}

export interface CsharpKeywordTypeParameterConstraint {
  readonly kind: "csharp-keyword";
  readonly keyword: "class" | "struct" | "notnull" | "unmanaged";
}

export interface CsharpConstructorTypeParameterConstraint {
  readonly kind: "csharp-constructor";
}

export interface CsharpTargetTypeParameterConstraintFact {
  readonly constraints: readonly CsharpTypeParameterConstraint[];
}

export interface CsharpObservedTargetAssignabilityFact {
  readonly source: ExtensionFactSubject;
  readonly target: ExtensionFactSubject;
  readonly relation?: "assignment" | "constraint" | "return" | "argument";
  readonly errorNode?: ExtensionFactSubject;
  readonly expression?: ExtensionFactSubject;
}

export interface CsharpTargetIterationFact {
  readonly operationId: string;
  readonly iterationKind: "sync" | "async" | "property-key";
  readonly lowering: CsharpTargetIterationLowering;
  readonly elementType?: ExtensionFactSubject;
  readonly evidence?: readonly ExtensionEvidence[];
}

export type CsharpTargetIterationLowering =
  | { readonly kind: "foreach" }
  | {
      readonly kind: "string-code-point";
      readonly lengthMember: string;
      readonly substringMember: string;
      readonly highSurrogateOperation: CsharpTargetMemberOperationFact;
      readonly lowSurrogateOperation: CsharpTargetMemberOperationFact;
    }
  | {
      readonly kind: "index-key";
      readonly lengthMember: string;
      readonly keyConversion: "invariant-string";
    }
  | {
      readonly kind: "key-collection";
      readonly keysMember: CsharpTargetMemberOperationFact;
    }
  | { readonly kind: "object-shape-keys" };

export interface CsharpRegularExpressionLiteralFact {
  readonly pattern: string;
  readonly flags: string;
}

export type CsharpArrayCarrierLane =
  | "native-fixed-local"
  | "native-read-sequence"
  | "native-read-indexable"
  | "native-dense-mutable"
  | "native-array-required"
  | "js-full-internal"
  | "hard-reject";

export type CsharpArrayBoundaryKind =
  | "local"
  | "internal-call"
  | "exported-api"
  | "native-provider-call";

export type CsharpArrayPublicShape =
  | "IEnumerable<T>"
  | "IReadOnlyList<T>"
  | "List<T>"
  | "T[]"
  | "compat-facade"
  | "not-exportable-as-native";

export interface CsharpArrayCarrierFact {
  readonly sourceKind: "ts-array" | "readonly-ts-array" | "tuple" | "typed-array" | "native-array";
  readonly lane: CsharpArrayCarrierLane;
  readonly elementType: TargetTypeRef;
  readonly carrierType: TargetTypeRef;
  readonly mutationVisibility: "none" | "internal" | "caller-visible";
  readonly boundary: CsharpArrayBoundaryKind;
}

export interface CsharpArrayBoundaryFact {
  readonly publicShape: CsharpArrayPublicShape;
  readonly publicType: TargetTypeRef;
  readonly coreCarrierLane: CsharpArrayCarrierLane;
  readonly coreCarrierType: TargetTypeRef;
  readonly preservesMutationVisibility: boolean;
  readonly requiresCopyIn: boolean;
  readonly requiresCopyOut: boolean;
}

export type CsharpTargetOperationFact =
  | CsharpTargetMemberOperationFact
  | CsharpTargetArrayCreationOperationFact
  | CsharpTargetTokenOperatorOperationFact
  | CsharpTargetIntrinsicOperatorOperationFact
  | CsharpTargetTypeofRuntimeOperationFact
  | CsharpTargetTypeofComparisonOperationFact
  | CsharpTargetCastOperationFact
  | CsharpTargetConversionOperatorOperationFact;

export interface CsharpTargetMemberOperationFact {
  readonly kind: "member";
  readonly operationId: string;
  readonly operationKind: "property" | "method" | "indexer" | "constructor" | "operator";
  readonly memberName: string;
  readonly static?: boolean;
  readonly declaringType?: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
  readonly argumentProjection?: readonly CsharpTargetOperationArgument[];
  readonly argumentArrayLiteralElementTypes?: readonly (TargetTypeRef | undefined)[];
  readonly selectedMember?: TargetMember;
}

export interface CsharpTargetArrayCreationOperationFact {
  readonly kind: "array-creation";
  readonly operationId: string;
  readonly elementType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly lengthArgumentIndex: number;
  readonly selectedMember: TargetMember;
}

export type CsharpTargetOperationArgument =
  | { readonly kind: "source-argument"; readonly index: number }
  | { readonly kind: "literal"; readonly value: string | number | boolean | null };

export interface CsharpTargetIntrinsicOperatorOperationFact {
  readonly kind: "intrinsic-operator";
  readonly operationId: string;
  readonly operator: CsharpTargetOperatorOperation;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTokenOperatorOperationFact {
  readonly kind: "operator-token";
  readonly operationId: string;
  readonly operator: string;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTypeofRuntimeOperationFact {
  readonly kind: "typeof-runtime";
  readonly operationId: string;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTypeofComparisonOperationFact {
  readonly kind: "typeof-comparison";
  readonly operationId: string;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
  readonly targetType: TargetTypeRef;
  readonly negated: boolean;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetCastOperationFact {
  readonly kind: "cast";
  readonly operationId: string;
  readonly targetType: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetConversionOperatorOperationFact {
  readonly kind: "conversion-operator";
  readonly operationId: string;
  readonly conversionKind: "implicit" | "explicit";
  readonly declaringType: TargetTypeRef;
  readonly sourceType: TargetTypeRef;
  readonly targetType: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
}

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
