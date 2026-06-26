import {
  jsonTargetMembersForSourceMember,
} from "../../json.js";
import {
  objectTargetMembersForSourceMember,
} from "../../objects.js";
import {
  createSourceLibraryMember,
} from "../../source-library.js";
import type {
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  CsharpJsPropertyPrecheckRule,
} from "./types.js";

const objectPropertySourceNames = [
  "keys",
  "values",
  "entries",
  "assign",
  "hasOwn",
] as const;

const jsonPropertySourceNames = [
  "parse",
  "stringify",
] as const;

export const propertyPrecheckRows: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    identity: { prefixes: ["Console."] },
    result: "defer",
  },
  ...objectPropertySourceNames.map((sourceName) =>
    targetMemberExistsRow(sourceKey("Object", sourceName), objectTargetMembersForSourceMember(createSourceLibraryMember("Object", sourceName)))
  ),
  ...jsonPropertySourceNames.map((sourceName) =>
    targetMemberExistsRow(sourceKey("JSON", sourceName), jsonTargetMembersForSourceMember(createSourceLibraryMember("JSON", sourceName)))
  ),
];

function targetMemberExistsRow(
  sourceId: SourceLibraryMemberKey,
  members: ReturnType<typeof objectTargetMembersForSourceMember>,
): CsharpJsPropertyPrecheckRule {
  return {
    sourceId,
    result: { kind: "target-member-exists", members },
  };
}

function sourceKey(declaringName: "Object" | "JSON", sourceName: string): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
