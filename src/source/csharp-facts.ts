import { defineExtensionFactKey } from "@tsonic/tsts";
import type { ExtensionEvidence, ExtensionFactSubject, TargetConstraint, TargetMember, TargetParameter, TargetTypeParameter, TargetTypeRef } from "@tsonic/tsts";
import {
  isCsharpNullableReferenceTargetType,
} from "./csharp-source-semantics/target-types.js";

export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export const CsharpTargetOperatorOperation = {
  typeTest: "type-test",
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
  | { readonly kind: "object-shape-keys" };

export interface CsharpRegularExpressionLiteralFact {
  readonly pattern: string;
  readonly flags: string;
}

export type CsharpTargetOperationFact =
  | CsharpTargetMemberOperationFact
  | CsharpTargetTokenOperatorOperationFact
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
  readonly argumentProjection?: readonly CsharpTargetOperationArgument[];
  readonly selectedMember?: TargetMember;
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

export const csharpTargetIterationFactKey = defineExtensionFactKey<CsharpTargetIterationFact>({
  extensionId: "tsonic.csharp",
  name: "targetIteration",
  equals: (left, right) =>
    left.operationId === right.operationId
    && left.iterationKind === right.iterationKind
    && csharpTargetIterationLoweringEquals(left.lowering, right.lowering)
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
      return right.kind === "member" && csharpTargetMemberOperationFactEquals(left, right);
    case "intrinsic-operator":
      return right.kind === "intrinsic-operator"
        && left.operator === right.operator
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "operator-token":
      return right.kind === "operator-token"
        && left.operator === right.operator
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "typeof-runtime":
      return right.kind === "typeof-runtime"
        && left.runtimeKind === right.runtimeKind
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "typeof-comparison":
      return right.kind === "typeof-comparison"
        && left.runtimeKind === right.runtimeKind
        && targetTypeRefEquals(left.targetType, right.targetType)
        && left.negated === right.negated
        && targetTypeRefEquals(left.resultType, right.resultType);
  }
}

function csharpTargetOperationArgumentArrayEquals(left: readonly CsharpTargetOperationArgument[] | undefined, right: readonly CsharpTargetOperationArgument[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((argument, index) => {
    const other = right[index];
    if (other === undefined || argument.kind !== other.kind) {
      return false;
    }
    switch (argument.kind) {
      case "source-argument":
        return other.kind === "source-argument" && argument.index === other.index;
      case "literal":
        return other.kind === "literal" && Object.is(argument.value, other.value);
    }
  });
}

function csharpTargetIterationLoweringEquals(left: CsharpTargetIterationLowering, right: CsharpTargetIterationLowering): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "foreach":
    case "object-shape-keys":
      return true;
    case "string-code-point":
      return right.kind === "string-code-point"
        && left.lengthMember === right.lengthMember
        && left.substringMember === right.substringMember
        && csharpTargetMemberOperationFactEquals(left.highSurrogateOperation, right.highSurrogateOperation)
        && csharpTargetMemberOperationFactEquals(left.lowSurrogateOperation, right.lowSurrogateOperation);
    case "index-key":
      return right.kind === "index-key"
        && left.lengthMember === right.lengthMember
        && left.keyConversion === right.keyConversion;
  }
}

function csharpTargetMemberOperationFactEquals(left: CsharpTargetMemberOperationFact, right: CsharpTargetMemberOperationFact): boolean {
  return left.kind === right.kind
    && left.operationId === right.operationId
    && left.operationKind === right.operationKind
    && left.memberName === right.memberName
    && left.static === right.static
    && targetTypeRefEquals(left.declaringType, right.declaringType)
    && targetTypeRefEquals(left.resultType, right.resultType)
    && csharpTargetOperationArgumentArrayEquals(left.argumentProjection, right.argumentProjection)
    && targetMemberEquals(left.selectedMember, right.selectedMember);
}

function targetMemberEquals(left: TargetMember | undefined, right: TargetMember | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return left.id === right.id
    && left.sourceName === right.sourceName
    && left.targetName === right.targetName
    && left.kind === right.kind
    && left.static === right.static
    && left.receiverPassing === right.receiverPassing
    && left.overloadGroup === right.overloadGroup
    && targetTypeRefEquals(left.declaringType, right.declaringType)
    && targetTypeRefEquals(left.returnType, right.returnType)
    && targetParameterArrayEquals(left.parameters, right.parameters)
    && targetTypeParameterArrayEquals(left.typeParameters, right.typeParameters);
}

function targetParameterArrayEquals(left: readonly TargetParameter[] | undefined, right: readonly TargetParameter[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined
      && parameter.name === other.name
      && parameter.passingMode === other.passingMode
      && parameter.optional === other.optional
      && parameter.paramsArray === other.paramsArray
      && targetTypeRefEquals(parameter.type, other.type);
  });
}

function targetTypeParameterArrayEquals(left: readonly TargetTypeParameter[] | undefined, right: readonly TargetTypeParameter[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined
      && parameter.name === other.name
      && parameter.variance === other.variance
      && targetConstraintArrayEquals(parameter.constraints, other.constraints);
  });
}

function csharpTypeParameterConstraintArrayEquals(
  left: readonly CsharpTypeParameterConstraint[] | undefined,
  right: readonly CsharpTypeParameterConstraint[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((constraint, index) => csharpTypeParameterConstraintEquals(constraint, right[index]));
}

function csharpTypeParameterConstraintEquals(
  left: CsharpTypeParameterConstraint | undefined,
  right: CsharpTypeParameterConstraint | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "csharp-type") {
    return right.kind === "csharp-type" && targetTypeRefEquals(left.type, right.type);
  }
  if (left.kind === "csharp-keyword") {
    return right.kind === "csharp-keyword" && left.keyword === right.keyword;
  }
  if (left.kind === "csharp-constructor") {
    return right.kind === "csharp-constructor";
  }
  return right.kind !== "csharp-type" &&
    right.kind !== "csharp-keyword" &&
    right.kind !== "csharp-constructor" &&
    targetConstraintEquals(left, right);
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
  if (isCsharpNullableReferenceTargetType(left) !== isCsharpNullableReferenceTargetType(right)) {
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
