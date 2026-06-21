import { defineExtensionFactKey } from "@tsonic/tsts";
import type { ExtensionEvidence, ExtensionFactSubject, TargetConstraint, TargetTypeRef } from "@tsonic/tsts";

export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export const CsharpTargetOperatorOperation = {
  typeTest: "type-test",
  jsStringCodeUnit: "js-string-code-unit",
} as const;

export type CsharpTargetOperatorOperation = typeof CsharpTargetOperatorOperation[keyof typeof CsharpTargetOperatorOperation];

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

export interface CsharpTargetTypeParameterConstraintFact {
  readonly constraints: readonly TargetConstraint[];
}

export const CsharpTargetIterationOperation = {
  foreachStatement: "foreach-statement",
  jsStringCodePoints: "js-string-code-points",
  jsObjectShapeKeys: "js-object-shape-keys",
  jsIndexKeys: "js-index-keys",
} as const;

export type CsharpTargetIterationOperation = typeof CsharpTargetIterationOperation[keyof typeof CsharpTargetIterationOperation];

export interface CsharpTargetIterationFact {
  readonly operationId: string;
  readonly iterationKind: "sync" | "async" | "property-key";
  readonly targetOperation: CsharpTargetIterationOperation;
  readonly elementType?: ExtensionFactSubject;
  readonly evidence?: readonly ExtensionEvidence[];
}

export interface CsharpRegularExpressionLiteralFact {
  readonly pattern: string;
  readonly flags: string;
}

export type CsharpTargetOperationFact =
  | CsharpTargetMemberOperationFact
  | CsharpTargetIntrinsicOperatorOperationFact
  | CsharpTargetTypeofRuntimeOperationFact
  | CsharpTargetTypeofComparisonOperationFact;

export interface CsharpTargetMemberOperationFact {
  readonly kind: "member";
  readonly operationId: string;
  readonly operationKind: "property" | "method" | "indexer" | "constructor" | "operator";
  readonly memberName: string;
  readonly static?: boolean;
  readonly declaringType?: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetIntrinsicOperatorOperationFact {
  readonly kind: "intrinsic-operator";
  readonly operationId: string;
  readonly operator: CsharpTargetOperatorOperation;
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
  readonly negated: boolean;
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

export const csharpTargetTypeParameterConstraintFactKey = defineExtensionFactKey<CsharpTargetTypeParameterConstraintFact>({
  extensionId: "tsonic.csharp",
  name: "typeParameterConstraint",
  equals: (left, right) => targetConstraintArrayEquals(left.constraints, right.constraints),
});

export const csharpTargetIterationFactKey = defineExtensionFactKey<CsharpTargetIterationFact>({
  extensionId: "tsonic.csharp",
  name: "targetIteration",
  equals: (left, right) =>
    left.operationId === right.operationId
    && left.iterationKind === right.iterationKind
    && left.targetOperation === right.targetOperation
    && left.elementType === right.elementType,
});

export const csharpTargetOperationFactKey = defineExtensionFactKey<CsharpTargetOperationFact>({
  extensionId: "tsonic.csharp",
  name: "targetOperation",
  equals: csharpTargetOperationFactEquals,
});

export const csharpRegularExpressionLiteralFactKey = defineExtensionFactKey<CsharpRegularExpressionLiteralFact>({
  extensionId: "tsonic.csharp",
  name: "regularExpressionLiteral",
  equals: (left, right) => left.pattern === right.pattern && left.flags === right.flags,
});

function csharpTargetOperationFactEquals(left: CsharpTargetOperationFact, right: CsharpTargetOperationFact): boolean {
  if (left.kind !== right.kind || left.operationId !== right.operationId) {
    return false;
  }
  switch (left.kind) {
    case "member":
      return right.kind === "member"
        && left.operationKind === right.operationKind
        && left.memberName === right.memberName
        && left.static === right.static
        && targetTypeRefEquals(left.declaringType, right.declaringType)
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "intrinsic-operator":
      return right.kind === "intrinsic-operator"
        && left.operator === right.operator
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "typeof-runtime":
      return right.kind === "typeof-runtime"
        && left.runtimeKind === right.runtimeKind
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "typeof-comparison":
      return right.kind === "typeof-comparison"
        && left.runtimeKind === right.runtimeKind
        && left.negated === right.negated
        && targetTypeRefEquals(left.resultType, right.resultType);
  }
}

function objectShapeMemberArrayEquals(left: readonly CsharpObjectShapeMemberFact[] | undefined, right: readonly CsharpObjectShapeMemberFact[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((member, index) => {
    const other = right[index];
    return other !== undefined
      && member.sourceName === other.sourceName
      && member.targetName === other.targetName
      && member.memberKind === other.memberKind
      && targetTypeRefEquals(member.type, other.type)
      && member.optional === other.optional
      && member.readonly === other.readonly;
  });
}

function targetConstraintArrayEquals(left: readonly TargetConstraint[] | undefined, right: readonly TargetConstraint[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((constraint, index) => targetConstraintEquals(constraint, right[index]));
}

function targetConstraintEquals(left: TargetConstraint | undefined, right: TargetConstraint | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "implements":
      return right.kind === "implements"
        && left.contract === right.contract
        && targetTypeRefArrayEquals(left.typeArguments, right.typeArguments);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific"
        && left.target === right.target
        && left.name === right.name
        && Object.is(left.value, right.value);
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "copy":
    case "clone":
    case "default":
    case "sized":
      return true;
  }
}

function targetTypeRefArrayEquals(left: readonly TargetTypeRef[] | undefined, right: readonly TargetTypeRef[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => targetTypeRefEquals(item, right[index]));
}

function targetTypeRefEquals(left: TargetTypeRef | undefined, right: TargetTypeRef | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named"
        && left.id === right.id
        && targetTypeRefArrayEquals(left.typeArguments, right.typeArguments);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array"
        && (left.rank ?? 1) === (right.rank ?? 1)
        && targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefArrayEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer"
        && left.mutability === right.mutability
        && targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer"
        && stringArrayEquals(left.abi, right.abi)
        && targetTypeRefArrayEquals(left.args, right.args)
        && targetTypeRefEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type"
        && left.name === right.name
        && targetTypeRefEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific"
        && left.target === right.target
        && left.name === right.name
        && Object.is(left.value, right.value);
  }
}

function stringArrayEquals(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}
