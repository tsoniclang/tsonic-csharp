import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { CsharpProjectReference } from "../../../target-model/project/references.js";
import { resolveDotnetFrameworkReferenceAssemblies } from "./framework-reference-packs.js";

export function resolveCsharpReflectionReferencePaths(
  references: readonly CsharpProjectReference[],
  providerReferences: { readonly assemblies: readonly string[]; readonly directories: readonly string[] },
  targetFramework: string,
  projectDirectory: string,
): readonly string[] {
  return rejectDuplicateReflectionReferencePaths([
    ...references
      .filter((reference): reference is Extract<CsharpProjectReference, { readonly kind: "assembly" }> => reference.kind === "assembly")
      .map((reference) => resolveProjectPath(projectDirectory, reference.hintPath ?? reference.include)),
    ...resolveDotnetFrameworkReferenceAssemblies(
      references
        .filter((reference): reference is Extract<CsharpProjectReference, { readonly kind: "framework" }> => reference.kind === "framework")
        .map((reference) => reference.include),
      targetFramework,
      projectDirectory,
    ),
    ...providerReferences.assemblies.map(reference => resolveProjectPath(projectDirectory, reference)),
    ...providerReferences.directories.flatMap((directory, index) => readProviderReferenceDirectory(
      resolveProjectPath(projectDirectory, directory), `providerReferences.directories[${index}]`,
    )),
  ]);
}

function readProviderReferenceDirectory(directory: string, path: string): readonly string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`C# target option '${path}' directory does not exist: ${directory}`);
  }
  const references = readdirSync(directory)
    .filter((entry) => entry.endsWith(".dll"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => join(directory, entry));
  if (references.length === 0) {
    throw new Error(`C# target option '${path}' directory contains no .NET assemblies: ${directory}`);
  }
  return references;
}

function resolveProjectPath(projectDirectory: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(projectDirectory, path);
}

function rejectDuplicateReflectionReferencePaths(references: readonly string[]): readonly string[] {
  const seen = new Map<string, string>();
  for (const reference of references) {
    const resolved = resolve(reference);
    const duplicate = seen.get(resolved);
    if (duplicate !== undefined) {
      throw new Error(`C# provider references contain duplicate assembly path '${duplicate}' and '${reference}'.`);
    }
    seen.set(resolved, reference);
  }
  return [...seen.values()];
}
