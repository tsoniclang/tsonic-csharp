import type {
  CsharpObjectShapeMemberFact,
} from "../../csharp-facts.js";
import {
  targetTypeRefEquals,
} from "./target-type-ref.js";

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
      && optionalSubjectArrayEquals(member.sourceSubjects, other.sourceSubjects)
      && member.targetName === other.targetName
      && member.memberKind === other.memberKind
      && targetTypeRefEquals(member.type, other.type)
      && member.optional === other.optional
      && member.readonly === other.readonly;
  });
}

function optionalSubjectArrayEquals(
  left: readonly unknown[] | undefined,
  right: readonly unknown[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((subject, index) => subject === right[index]);
}
