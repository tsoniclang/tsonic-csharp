import {
  jsonTargetMembersForSourceName,
} from "../../json.js";
import {
  hasObjectTargetMember,
} from "../../objects.js";
import {
  sourceLibraryMemberName,
} from "../../source-library.js";
import type {
  CsharpJsPropertyPrecheckRule,
} from "./types.js";

export const propertyPrecheckRules: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    identity: { prefixes: ["Console."] },
    result: () => "defer",
  },
  {
    identity: { prefixes: ["Object."] },
    result: (sourceMember) => hasObjectTargetMember(sourceLibraryMemberName(sourceMember)) ? "defer" : "reject-unmapped",
  },
  {
    identity: { prefixes: ["JSON."] },
    result: (sourceMember) => jsonTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0 ? "defer" : "reject-unmapped",
  },
];
