import type {
  ExtensionFactSubject,
  TargetConstraint,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeMemberFact,
  CsharpTargetIterationLowering,
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
  CsharpTargetOperationFact,
  CsharpTypeParameterConstraint,
} from "../csharp-facts.js";
import {
  isCsharpNullableReferenceTargetType,
} from "../csharp-source-semantics/target-types.js";

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
    && csharpTargetOperationArgumentArrayEquals(left.argumentProjection, right.argumentProjection)
    && optionalTargetTypeRefArrayWithUndefinedEquals(left.argumentArrayLiteralElementTypes, right.argumentArrayLiteralElementTypes)
    && targetMemberEquals(left.selectedMember, right.selectedMember);
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
      && targetOwnedParameterMetadataEquals(parameter, other)
      && targetTypeRefEquals(parameter.type, other.type);
  });
}

function targetOwnedParameterMetadataEquals(left: TargetParameter, right: TargetParameter): boolean {
  return simpleMetadataEquals(
    (left as { readonly defaultValue?: unknown }).defaultValue,
    (right as { readonly defaultValue?: unknown }).defaultValue,
  );
}

function simpleMetadataEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return key === rightKey && simpleMetadataEquals(left[key], right[rightKey]);
    });
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function csharpTypeParameterConstraintArrayEquals(
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

export function objectShapeMemberArrayEquals(left: readonly CsharpObjectShapeMemberFact[] | undefined, right: readonly CsharpObjectShapeMemberFact[] | undefined): boolean {
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
      && targetTypeRefEquals(member.type, right[index]?.type)
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
    case "unsupported":
      return right.kind === "unsupported"
        && left.target === right.target
        && left.id === right.id
        && left.reason === right.reason
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

export function targetTypeRefArrayEquals(left: readonly TargetTypeRef[] | undefined, right: readonly TargetTypeRef[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => targetTypeRefEquals(item, right[index]));
}

export function extensionFactSubjectTypeRefEquals(left: ExtensionFactSubject | undefined, right: ExtensionFactSubject | undefined): boolean {
  if (left === right) {
    return true;
  }
  return isTargetTypeRefSubject(left) && isTargetTypeRefSubject(right) && targetTypeRefEquals(left, right);
}

function isTargetTypeRefSubject(subject: ExtensionFactSubject | undefined): subject is TargetTypeRef {
  return typeof subject === "object" &&
    subject !== null &&
    "kind" in subject &&
    typeof (subject as { readonly kind?: unknown }).kind === "string";
}

export function targetTypeRefEquals(left: TargetTypeRef | undefined, right: TargetTypeRef | undefined): boolean {
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
