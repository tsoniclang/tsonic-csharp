import type {
  TargetSelection,
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import {
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  isAbsolute,
  join,
  resolve,
} from "node:path";

export type CsharpProjectReference =
  | { readonly kind: "project"; readonly include: string }
  | { readonly kind: "package"; readonly include: string; readonly version?: string; readonly privateAssets?: string; readonly includeAssets?: string }
  | { readonly kind: "framework"; readonly include: string }
  | { readonly kind: "assembly"; readonly include: string; readonly hintPath?: string };

export type CsharpOutputType = "Exe" | "Library";

const supportedCsharpTargetOptionKeys = Object.freeze([
  "assemblyName",
  "implicitUsings",
  "namespace",
  "nullable",
  "outputType",
  "providerReferences",
  "projectFile",
  "properties",
  "publishAot",
  "references",
  "targetFramework",
  "typescriptCompatibility",
]);

export function validateCsharpTargetOptions(target: TargetSelection): void {
  const options = target.options;
  if (options === undefined) {
    return;
  }
  rejectUnknownKeys(options, "options", supportedCsharpTargetOptionKeys);
}

export function readCsharpTargetFramework(target: TargetSelection): string {
  return readStringOption(target, "targetFramework", "net10.0");
}

export function readCsharpTypescriptCompatibilityMode(target: TargetSelection): TargetTypescriptCompatibilityMode {
  const value = target.options?.typescriptCompatibility;
  if (value === undefined) {
    return "strict-native";
  }
  if (value !== "strict-native" && value !== "compat") {
    throw new Error("C# target option 'typescriptCompatibility' must be either 'strict-native' or 'compat'.");
  }
  return value;
}

export function readCsharpOutputType(target: TargetSelection): CsharpOutputType {
  const value = readOptionalStringOption(target, "outputType");
  if (value === undefined) {
    return "Library";
  }
  if (value !== "Exe" && value !== "Library") {
    throw new Error("C# target option 'outputType' must be either 'Exe' or 'Library'.");
  }
  return value;
}

export function readCsharpUserProjectFile(target: TargetSelection): string | undefined {
  return readOptionalStringOption(target, "projectFile");
}

export function readCsharpReferences(target: TargetSelection): readonly CsharpProjectReference[] {
  const raw = target.options?.references;
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

export function readCsharpReflectionReferencePaths(target: TargetSelection): readonly string[] {
  return rejectDuplicateReflectionReferencePaths([
    ...readCsharpReferences(target)
      .filter((reference): reference is Extract<CsharpProjectReference, { readonly kind: "assembly" }> => reference.kind === "assembly")
      .map((reference) => reference.hintPath ?? reference.include),
    ...readCsharpProviderReferencePaths(target),
  ]);
}

export function readStringOption(target: TargetSelection, key: string, defaultValue: string): string {
  return readOptionalStringOption(target, key) ?? defaultValue;
}

export function readOptionalStringOption(target: TargetSelection, key: string): string | undefined {
  const value = target.options?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${key}' must be a non-empty string.`);
  }
  return value;
}

export function readOptionalBooleanOption(target: TargetSelection, key: string): boolean | undefined {
  const value = target.options?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`C# target option '${key}' must be a boolean.`);
  }
  return value;
}

export function readStringArrayProperty(raw: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = raw[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`C# target option 'references.${key}' must be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`C# target option 'references.${key}[${index}]' must be a non-empty string.`);
    }
    return entry;
  });
}

export function readObjectArrayProperty(raw: Readonly<Record<string, unknown>>, key: string): readonly Readonly<Record<string, unknown>>[] {
  const value = raw[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`C# target option 'references.${key}' must be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`C# target option 'references.${key}[${index}]' must be an object.`);
    }
    return entry;
  });
}

export function readRequiredString(raw: Readonly<Record<string, unknown>>, key: string, path: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${path}.${key}' must be a non-empty string.`);
  }
  return value;
}

export function readOptionalString(raw: Readonly<Record<string, unknown>>, key: string, path: string): string | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${path}.${key}' must be a non-empty string.`);
  }
  return value;
}

export function rejectUnknownKeys(raw: Readonly<Record<string, unknown>>, path: string, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`C# target option '${path}.${key}' is not supported.`);
    }
  }
}

export function isXmlElementName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value);
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isScalarPropertyValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
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

function readCsharpProviderReferencePaths(target: TargetSelection): readonly string[] {
  const raw = target.options?.providerReferences;
  if (raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    throw new Error("C# target option 'providerReferences' must be an object.");
  }
  rejectUnknownKeys(raw, "providerReferences", ["assemblies", "directories"]);
  return [
    ...readStringArrayProperty(raw, "assemblies").map((reference) => resolve(reference)),
    ...readStringArrayProperty(raw, "directories").flatMap((directory, index) =>
      readProviderReferenceDirectory(directory, `providerReferences.directories[${index}]`)
    ),
  ];
}

function readProviderReferenceDirectory(directory: string, path: string): readonly string[] {
  if (!isAbsolute(directory)) {
    throw new Error(`C# target option '${path}' must be an absolute directory path.`);
  }
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
