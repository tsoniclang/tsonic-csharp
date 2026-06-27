import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  jsonTargetMemberIdentityIndex,
} from "../../json.js";
import {
  objectTargetMemberIdentityIndex,
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
    targetMemberExistsRow(sourceKey("Object", sourceName), objectTargetMemberIdentityIndex)
  ),
  ...jsonPropertySourceNames.map((sourceName) =>
    targetMemberExistsRow(sourceKey("JSON", sourceName), jsonTargetMemberIdentityIndex)
  ),
];

function targetMemberExistsRow(
  sourceId: SourceLibraryMemberKey,
  index: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): CsharpJsPropertyPrecheckRule {
  return {
    sourceId,
    result: { kind: "target-member-exists", members: index.get(sourceId) ?? [] },
  };
}

function sourceKey(declaringName: "Object" | "JSON", sourceName: string): SourceLibraryMemberKey {
  return `${declaringName}.${sourceName}`;
}
