import type { TargetCompileInput } from "@tsonic/target-api";

export function readStringOption(input: TargetCompileInput, key: string, defaultValue: string): string {
  return readOptionalStringOption(input, key) ?? defaultValue;
}

export function readOptionalStringOption(input: TargetCompileInput, key: string): string | undefined {
  const value = input.target.options?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`C# target option '${key}' must be a non-empty string.`);
  }
  return value;
}

export function readOptionalBooleanOption(input: TargetCompileInput, key: string): boolean | undefined {
  const value = input.target.options?.[key];
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
