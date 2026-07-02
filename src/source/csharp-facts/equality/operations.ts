import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetIterationLowering,
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
  CsharpTargetOperationFact,
} from "../../csharp-facts.js";
import {
  targetMemberEquals,
} from "./target-member.js";
import {
  targetTypeRefEquals,
} from "./target-type-ref.js";

export function csharpTargetOperationFactEquals(left: CsharpTargetOperationFact, right: CsharpTargetOperationFact): boolean {
  if (left.kind !== right.kind || left.operationId !== right.operationId) {
    return false;
  }
  switch (left.kind) {
    case "member":
      return right.kind === "member" && csharpTargetMemberOperationFactEquals(left, right);
    case "array-creation":
      return right.kind === "array-creation"
        && targetTypeRefEquals(left.elementType, right.elementType)
        && targetTypeRefEquals(left.resultType, right.resultType)
        && left.lengthArgumentIndex === right.lengthArgumentIndex
        && targetMemberEquals(left.selectedMember, right.selectedMember);
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
    case "cast":
      return right.kind === "cast"
        && targetTypeRefEquals(left.targetType, right.targetType)
        && targetTypeRefEquals(left.resultType, right.resultType);
    case "conversion-operator":
      return right.kind === "conversion-operator"
        && left.conversionKind === right.conversionKind
        && targetTypeRefEquals(left.declaringType, right.declaringType)
        && targetTypeRefEquals(left.sourceType, right.sourceType)
        && targetTypeRefEquals(left.targetType, right.targetType)
        && targetTypeRefEquals(left.resultType, right.resultType);
  }
}

export function csharpTargetIterationLoweringEquals(left: CsharpTargetIterationLowering, right: CsharpTargetIterationLowering): boolean {
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
    case "key-collection":
      return right.kind === "key-collection"
        && csharpTargetMemberOperationFactEquals(left.keysMember, right.keysMember);
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
    && optionalTargetTypeRefArrayWithUndefinedEquals(left.typeArguments, right.typeArguments)
    && csharpTargetOperationArgumentArrayEquals(left.argumentProjection, right.argumentProjection)
    && optionalTargetTypeRefArrayWithUndefinedEquals(left.argumentArrayLiteralElementTypes, right.argumentArrayLiteralElementTypes)
    && targetMemberEquals(left.selectedMember, right.selectedMember);
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

function optionalTargetTypeRefArrayWithUndefinedEquals(left: readonly (TargetTypeRef | undefined)[] | undefined, right: readonly (TargetTypeRef | undefined)[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return item === undefined || other === undefined
      ? item === other
      : targetTypeRefEquals(item, other);
  });
}
