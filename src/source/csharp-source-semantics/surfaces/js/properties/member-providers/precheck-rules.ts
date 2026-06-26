import {
  jsonTargetMembersForSourceName,
} from "../../json.js";
import {
  objectTargetMembersForSourceName,
} from "../../objects.js";
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
    targetMemberExistsRow(sourceKey("Object", sourceName), objectTargetMembersForSourceName(sourceName))
  ),
  ...jsonPropertySourceNames.map((sourceName) =>
    targetMemberExistsRow(sourceKey("JSON", sourceName), jsonTargetMembersForSourceName(sourceName))
  ),
];

function targetMemberExistsRow(
  sourceId: SourceLibraryMemberKey,
  members: ReturnType<typeof objectTargetMembersForSourceName>,
): CsharpJsPropertyPrecheckRule {
  return {
    sourceId,
    result: { kind: "target-member-exists", members },
  };
}

function sourceKey(declaringName: "Object" | "JSON", sourceName: string): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
