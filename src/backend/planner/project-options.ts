import type { TargetCompileInput } from "@tsonic/target-api";
import { sanitizeIdentifier } from "./identifiers.js";
import {
  readOptionalStringOption,
} from "./project-option-values.js";

export {
  readCsharpProjectProperties,
} from "./project-property-options.js";
export {
  readReferencesOption,
} from "./project-reference-options.js";

export function readNamespace(input: TargetCompileInput): string {
  return formatNamespace(readOptionalStringOption(input, "namespace") ?? "Tsonic.Generated");
}

export function readAssemblyName(input: TargetCompileInput): string {
  return formatAssemblyName(readOptionalStringOption(input, "assemblyName") ?? "TsonicGenerated");
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
