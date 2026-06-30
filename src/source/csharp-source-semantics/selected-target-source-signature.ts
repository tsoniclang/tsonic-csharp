import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "./target-types.js";

export function targetMemberAsSourceSelectedSignature(member: CsharpTargetMember): CsharpTargetMember {
  if (member.receiverPassing !== "first-argument") {
    return member;
  }
  const [receiverParameter, ...sourceParameters] = member.parameters;
  return {
    ...member,
    ...(receiverParameter === undefined ? {} : { declaringType: receiverParameter.type }),
    parameters: sourceParameters,
  };
}

export function targetMembersHaveCompatibleSourceSelectedSignature(expected: CsharpTargetMember, actual: CsharpTargetMember): boolean {
  if (expected.id !== actual.id) {
    return false;
  }
  if (expected.kind !== actual.kind || expected.targetName !== actual.targetName || expected.static !== actual.static || expected.receiverPassing !== actual.receiverPassing) {
    return false;
  }
  const actualAsSource = targetMemberAsSourceSelectedSignature(actual);
  if (expected.parameters.length !== actualAsSource.parameters.length) {
    return false;
  }
  if (
    !optionalTargetTypeEquals(expected.returnType, actualAsSource.returnType) ||
    !optionalTargetTypeEquals(expected.declaringType, actualAsSource.declaringType)
  ) {
    return false;
  }
  if (!firstArgumentReceiverMatchesDeclaringType(expected, actual)) {
    return false;
  }
  for (let index = 0; index < expected.parameters.length; index += 1) {
    const expectedParameter = expected.parameters[index];
    const actualParameter = actualAsSource.parameters[index];
    if (expectedParameter === undefined || actualParameter === undefined) {
      return false;
    }
    if (
      actualParameter.passingMode !== expectedParameter.passingMode ||
      actualParameter.optional !== expectedParameter.optional ||
      actualParameter.paramsArray !== expectedParameter.paramsArray ||
      !targetParameterMetadataEquals(actualParameter, expectedParameter) ||
      !targetTypeRefEquals(actualParameter.type, expectedParameter.type)
    ) {
      return false;
    }
  }
  return true;
}

function firstArgumentReceiverMatchesDeclaringType(expected: CsharpTargetMember, actual: CsharpTargetMember): boolean {
  if (actual.receiverPassing !== "first-argument") {
    return true;
  }
  const actualReceiverParameter = actual.parameters[0];
  if (actualReceiverParameter === undefined || expected.declaringType === undefined) {
    return false;
  }
  return targetTypeRefEquals(actualReceiverParameter.type, expected.declaringType);
}

function optionalTargetTypeEquals(
  expected: TargetTypeRef | undefined,
  actual: TargetTypeRef | undefined,
): boolean {
  if (expected === undefined || actual === undefined) {
    return expected === actual;
  }
  return targetTypeRefEquals(expected, actual);
}

function targetParameterMetadataEquals(left: CsharpTargetParameter, right: CsharpTargetParameter): boolean {
  return left.csharpOmittableOptionalArgument === right.csharpOmittableOptionalArgument &&
    targetMetadataValueEquals(left.defaultValue, right.defaultValue) &&
    targetMetadataValueEquals(left.unsupportedDefaultValue, right.unsupportedDefaultValue);
}

function targetMetadataValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => targetMetadataValueEquals(item, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return key === rightKey && targetMetadataValueEquals(left[key], right[rightKey]);
    });
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
