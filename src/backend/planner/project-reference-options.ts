import type { TargetCompileInput } from "@tsonic/target-api";
import {
  type CsharpProjectReference,
  readCsharpReferences,
} from "../../options/csharp-target-options.js";

export function readReferencesOption(input: TargetCompileInput): readonly CsharpProjectReference[] {
  return rejectDuplicateReferences([
    ...readCsharpReferences(input.target),
    ...input.runtimeReferences.map(csharpProjectReferenceFromRuntimeReference),
  ]);
}

function csharpProjectReferenceFromRuntimeReference(reference: TargetCompileInput["runtimeReferences"][number]): CsharpProjectReference {
  switch (reference.kind) {
    case "project":
      return { kind: "project", include: reference.include };
    case "package":
      return {
        kind: "package",
        include: reference.include,
        version: reference.version,
        privateAssets: reference.attributes?.PrivateAssets,
        includeAssets: reference.attributes?.IncludeAssets,
      };
    case "framework":
      return { kind: "framework", include: reference.include };
    case "assembly":
      return {
        kind: "assembly",
        include: reference.include,
        hintPath: reference.attributes?.HintPath,
      };
    default:
      throw new Error(`C# runtime reference kind '${reference.kind}' is not supported.`);
  }
}

function rejectDuplicateReferences(references: readonly CsharpProjectReference[]): readonly CsharpProjectReference[] {
  const seen = new Set<string>();
  for (const reference of references) {
    const key = `${reference.kind}:${reference.include}`;
    if (seen.has(key)) {
      throw new Error(`C# target references contain duplicate ${reference.kind} reference '${reference.include}'.`);
    }
    seen.add(key);
  }
  return references;
}
