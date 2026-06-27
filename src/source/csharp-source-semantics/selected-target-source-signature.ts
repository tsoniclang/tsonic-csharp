import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";

export function targetMemberAsSourceSelectedSignature(member: TargetMember): TargetMember {
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

export function targetMembersHaveCompatibleSourceSelectedSignature(expected: TargetMember, actual: TargetMember): boolean {
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
      !targetTypeRefEquals(actualParameter.type, expectedParameter.type)
    ) {
      return false;
    }
  }
  return true;
}

function firstArgumentReceiverMatchesDeclaringType(expected: TargetMember, actual: TargetMember): boolean {
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
