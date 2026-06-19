import type { TargetArtifact, TargetCompileInput, TargetSourceFile } from "@tsonic/target-api";
import { sanitizeIdentifier } from "./identifiers.js";

export function projectArtifact(input: TargetCompileInput, sourceArtifacts: readonly TargetSourceFile[]): TargetArtifact {
  void sourceArtifacts;
  const properties = csharpProjectProperties(input);
  return {
    kind: "project",
    path: `${readAssemblyName(input)}.csproj`,
    text: [
      "<Project Sdk=\"Microsoft.NET.Sdk\">",
      "  <PropertyGroup>",
      ...properties.map(([name, value]) => `    <${name}>${escapeXml(value)}</${name}>`),
      "  </PropertyGroup>",
      "</Project>",
      "",
    ].join("\n"),
  };
}

export function readNamespace(input: TargetCompileInput): string {
  return formatNamespace(readOptionalStringOption(input, "namespace") ?? "Tsonic.Generated");
}

function csharpProjectProperties(input: TargetCompileInput): readonly (readonly [string, string])[] {
  const properties = new Map<string, string>();
  properties.set("TargetFramework", readStringOption(input, "targetFramework", "net10.0"));
  properties.set("Nullable", readStringOption(input, "nullable", "enable"));
  properties.set("ImplicitUsings", readStringOption(input, "implicitUsings", "disable"));
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

function readAssemblyName(input: TargetCompileInput): string {
  return formatAssemblyName(readOptionalStringOption(input, "assemblyName") ?? "TsonicGenerated");
}

function readStringOption(input: TargetCompileInput, key: string, fallback: string): string {
  return readOptionalStringOption(input, key) ?? fallback;
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
