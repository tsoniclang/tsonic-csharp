import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "./target-types.js";
import {
  targetMemberAsSelection,
  targetMemberSelectionEquals,
} from "./target-selection-contract.js";

export function targetMemberAsSourceSelectedSignature(
  member: CsharpTargetMember,
  options: { readonly firstArgumentReceiver?: boolean } = {},
): TargetMember {
  return targetMemberAsSelection(csharpTargetMemberAsSourceSelectedSignature(member, options));
}

export function csharpTargetMemberAsSourceSelectedSignature(
  member: CsharpTargetMember,
  options: { readonly firstArgumentReceiver?: boolean } = {},
): CsharpTargetMember {
  const firstArgumentReceiver = options.firstArgumentReceiver ?? member.receiverPassing === "first-argument";
  if (!firstArgumentReceiver) {
    return member;
  }
  const [receiverParameter, ...sourceParameters] = member.parameters;
  return {
    ...member,
    ...(receiverParameter === undefined ? {} : { declaringType: receiverParameter.type }),
    parameters: sourceParameters,
  };
}

export function targetMembersHaveCompatibleSourceSelectedSignature(expected: TargetMember, actual: CsharpTargetMember): boolean {
  const actualAsSource = targetMemberAsSourceSelectedSignatureForExpected(expected, actual);
  return targetMemberSelectionEquals(expected, targetMemberAsSelection(actualAsSource));
}

export function targetMemberAsSourceSelectedSignatureForExpected(
  expected: TargetMember,
  actual: CsharpTargetMember,
): CsharpTargetMember {
  return csharpTargetMemberAsSourceSelectedSignature(actual, {
    firstArgumentReceiver: targetMemberSourceSelectedSignatureUsesFirstArgumentReceiver(expected, actual),
  });
}

export function targetMemberSourceSelectedSignatureUsesFirstArgumentReceiver(
  expected: TargetMember,
  actual: CsharpTargetMember,
): boolean {
  if (actual.receiverPassing !== "first-argument") {
    return false;
  }
  if (expected.parameters.length !== actual.parameters.length - 1) {
    return false;
  }
  return actual.parameters[0] !== undefined;
}
