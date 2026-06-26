import {
  jsonTargetMembersForSourceName,
} from "../../json.js";
import {
  objectTargetMembersForSourceName,
} from "../../objects.js";
import type {
  CsharpJsPropertyTargetMemberSet,
  CsharpJsPropertyPrecheckRule,
} from "./types.js";

const objectTargetMemberSet = targetMemberSet(objectTargetMembersForSourceName);
const jsonTargetMemberSet = targetMemberSet(jsonTargetMembersForSourceName);

export const propertyPrecheckRules: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    identity: { prefixes: ["Console."] },
    result: "defer",
  },
  {
    identity: { prefixes: ["Object."] },
    result: { kind: "target-member-exists", members: objectTargetMemberSet },
  },
  {
    identity: { prefixes: ["JSON."] },
    result: { kind: "target-member-exists", members: jsonTargetMemberSet },
  },
];

function targetMemberSet(get: CsharpJsPropertyTargetMemberSet["get"]): CsharpJsPropertyTargetMemberSet {
  return { get };
}
