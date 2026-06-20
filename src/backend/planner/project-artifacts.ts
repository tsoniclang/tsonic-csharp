import type { TargetArtifact, TargetCompileInput, TargetSourceFile } from "@tsonic/target-api";
import { sanitizeIdentifier } from "./identifiers.js";

export function projectArtifact(
  input: TargetCompileInput,
  sourceArtifacts: readonly TargetSourceFile[],
  options: { readonly allowUnsafeBlocks?: boolean } = {},
): TargetArtifact {
  void sourceArtifacts;
  const properties = csharpProjectProperties(input, options);
  const itemGroups = csharpProjectItemGroups(input);
  return {
    kind: "project",
    path: `${readAssemblyName(input)}.csproj`,
    text: [
      "<Project Sdk=\"Microsoft.NET.Sdk\">",
      "  <PropertyGroup>",
      ...properties.map(([name, value]) => `    <${name}>${escapeXml(value)}</${name}>`),
      "  </PropertyGroup>",
      ...itemGroups,
      "</Project>",
      "",
    ].join("\n"),
  };
}

export function readNamespace(input: TargetCompileInput): string {
  return formatNamespace(readOptionalStringOption(input, "namespace") ?? "Tsonic.Generated");
}

function csharpProjectProperties(
  input: TargetCompileInput,
  options: { readonly allowUnsafeBlocks?: boolean },
): readonly (readonly [string, string])[] {
  const properties = new Map<string, string>();
  properties.set("TargetFramework", readStringOption(input, "targetFramework", "net10.0"));
  properties.set("Nullable", readStringOption(input, "nullable", "enable"));
  properties.set("ImplicitUsings", readStringOption(input, "implicitUsings", "disable"));
  if (options.allowUnsafeBlocks === true) {
    properties.set("AllowUnsafeBlocks", "true");
  }
  const outputType = readOptionalStringOption(input, "outputType");
  if (outputType !== undefined) {
    properties.set("OutputType", outputType);
  }
  const publishAot = readOptionalBooleanOption(input, "publishAot");
  if (publishAot !== undefined) {
    properties.set("PublishAot", publishAot ? "true" : "false");
  }
  const customProperties = input.target.options?.properties;
  if (customProperties !== undefined) {
    if (!isRecord(customProperties)) {
      throw new Error("C# target option 'properties' must be an object.");
    }
    for (const [name, value] of Object.entries(customProperties)) {
      if (!isXmlElementName(name)) {
        throw new Error(`C# target property '${name}' is not a valid XML element name.`);
      }
      if (!isScalarPropertyValue(value)) {
        throw new Error(`C# target property '${name}' must be a string, number, or boolean.`);
      }
      properties.set(name, String(value));
    }
  }
  return [...properties.entries()];
}

function csharpProjectItemGroups(input: TargetCompileInput): readonly string[] {
  const references = readReferencesOption(input);
  if (references.length === 0) {
    return [];
  }
  return [
    "  <ItemGroup>",
    ...references.map(formatReferenceItem),
    "  </ItemGroup>",
  ];
}

type CsharpProjectReference =
  | { readonly kind: "project"; readonly include: string }
  | { readonly kind: "package"; readonly include: string; readonly version?: string; readonly privateAssets?: string; readonly includeAssets?: string }
  | { readonly kind: "framework"; readonly include: string }
  | { readonly kind: "assembly"; readonly include: string; readonly hintPath?: string };

function readReferencesOption(input: TargetCompileInput): readonly CsharpProjectReference[] {
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

function formatReferenceItem(reference: CsharpProjectReference): string {
  switch (reference.kind) {
    case "project":
      return `    <ProjectReference Include="${escapeXml(reference.include)}" />`;
    case "package":
      return formatXmlItem("PackageReference", {
        Include: reference.include,
        Version: reference.version,
        PrivateAssets: reference.privateAssets,
        IncludeAssets: reference.includeAssets,
      });
    case "framework":
      return `    <FrameworkReference Include="${escapeXml(reference.include)}" />`;
    case "assembly":
      return formatXmlItem("Reference", {
        Include: reference.include,
        HintPath: reference.hintPath,
      });
  }
}

function formatXmlItem(name: string, attributes: Readonly<Record<string, string | undefined>>): string {
  const renderedAttributes = Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(" ");
  return `    <${name} ${renderedAttributes} />`;
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

function readAssemblyName(input: TargetCompileInput): string {
  return formatAssemblyName(readOptionalStringOption(input, "assemblyName") ?? "TsonicGenerated");
}

function readStringOption(input: TargetCompileInput, key: string, defaultValue: string): string {
  return readOptionalStringOption(input, key) ?? defaultValue;
}

function readOptionalStringOption(input: TargetCompileInput, key: string): string | undefined {
  const value = input.target.options?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${key}' must be a non-empty string.`);
  }
  return value;
}

function readOptionalBooleanOption(input: TargetCompileInput, key: string): boolean | undefined {
  const value = input.target.options?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`C# target option '${key}' must be a boolean.`);
  }
  return value;
}

function readStringArrayProperty(raw: Readonly<Record<string, unknown>>, key: string): readonly string[] {
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

function readObjectArrayProperty(raw: Readonly<Record<string, unknown>>, key: string): readonly Readonly<Record<string, unknown>>[] {
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

function readRequiredString(raw: Readonly<Record<string, unknown>>, key: string, path: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${path}.${key}' must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(raw: Readonly<Record<string, unknown>>, key: string, path: string): string | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${path}.${key}' must be a non-empty string.`);
  }
  return value;
}

function rejectUnknownKeys(raw: Readonly<Record<string, unknown>>, path: string, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`C# target option '${path}.${key}' is not supported.`);
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isXmlElementName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalarPropertyValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function formatNamespace(value: string): string {
  const segments = value.split(".");
  if (segments.some((segment) => !isPlainIdentifier(segment))) {
    throw new Error("C# target option 'namespace' must be a dot-separated C# identifier path.");
  }
  return segments.map(sanitizeIdentifier).join(".");
}

function formatAssemblyName(value: string): string {
  if (!isAssemblyName(value)) {
    throw new Error("C# target option 'assemblyName' must be a file-safe .NET assembly name.");
  }
  return value;
}

function isAssemblyName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value);
}

function isPlainIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
