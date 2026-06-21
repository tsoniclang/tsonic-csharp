import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  CsharpProjectReference,
} from "./project-artifact-types.js";
import {
  isRecord,
  readObjectArrayProperty,
  readOptionalString,
  readRequiredString,
  readStringArrayProperty,
  rejectUnknownKeys,
} from "./project-option-values.js";

export function readReferencesOption(input: TargetCompileInput): readonly CsharpProjectReference[] {
  const raw = input.target.options?.references;
  if (raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    throw new Error("C# target option 'references' must be an object.");
  }
  rejectUnknownKeys(raw, "references", ["projects", "packages", "frameworks", "assemblies"]);
  return rejectDuplicateReferences([
    ...readStringArrayProperty(raw, "projects").map((include) => ({ kind: "project", include }) satisfies CsharpProjectReference),
    ...readPackageReferences(raw),
    ...readStringArrayProperty(raw, "frameworks").map((include) => ({ kind: "framework", include }) satisfies CsharpProjectReference),
    ...readAssemblyReferences(raw),
  ]);
}

function readPackageReferences(raw: Readonly<Record<string, unknown>>): readonly CsharpProjectReference[] {
  return readObjectArrayProperty(raw, "packages").map((entry, index) => {
    rejectUnknownKeys(entry, `references.packages[${index}]`, ["include", "version", "privateAssets", "includeAssets"]);
    return {
      kind: "package",
      include: readRequiredString(entry, "include", `references.packages[${index}]`),
      version: readOptionalString(entry, "version", `references.packages[${index}]`),
      privateAssets: readOptionalString(entry, "privateAssets", `references.packages[${index}]`),
      includeAssets: readOptionalString(entry, "includeAssets", `references.packages[${index}]`),
    };
  });
}

function readAssemblyReferences(raw: Readonly<Record<string, unknown>>): readonly CsharpProjectReference[] {
  return readObjectArrayProperty(raw, "assemblies").map((entry, index) => {
    rejectUnknownKeys(entry, `references.assemblies[${index}]`, ["include", "hintPath"]);
    return {
      kind: "assembly",
      include: readRequiredString(entry, "include", `references.assemblies[${index}]`),
      hintPath: readOptionalString(entry, "hintPath", `references.assemblies[${index}]`),
    };
  });
}

function rejectDuplicateReferences(references: readonly CsharpProjectReference[]): readonly CsharpProjectReference[] {
  const seen = new Set<string>();
  for (const reference of references) {
    const key = `${reference.kind}:${reference.include}`;
    if (seen.has(key)) {
      throw new Error(`C# target option 'references' contains duplicate ${reference.kind} reference '${reference.include}'.`);
    }
    seen.add(key);
  }
  return references;
}
