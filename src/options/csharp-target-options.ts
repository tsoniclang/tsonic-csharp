import type {
  TargetSelection,
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";

export type CsharpProjectReference =
  | { readonly kind: "project"; readonly include: string }
  | { readonly kind: "package"; readonly include: string; readonly version?: string; readonly privateAssets?: string; readonly includeAssets?: string }
  | { readonly kind: "framework"; readonly include: string }
  | { readonly kind: "assembly"; readonly include: string; readonly hintPath?: string };

const supportedCsharpTargetOptionKeys = Object.freeze([
  "assemblyName",
  "implicitUsings",
  "namespace",
  "nullable",
  "outputType",
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
  return readCsharpReferences(target)
    .filter((reference): reference is Extract<CsharpProjectReference, { readonly kind: "assembly" }> => reference.kind === "assembly")
    .map((reference) => reference.hintPath ?? reference.include);
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
