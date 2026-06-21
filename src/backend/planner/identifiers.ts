import type {
  TargetDiagnostic,
} from "@tsonic/target-api";

export function sanitizeIdentifier(value: string): string {
  const identifier = tryCsharpIdentifier(value);
  if (identifier === undefined) {
    throw new Error(`Invalid C# identifier '${value}'. C# backend names must come from source/provider facts with explicit valid target names.`);
  }
  return identifier;
}

export function tryCsharpIdentifier(value: string): string | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return undefined;
  }
  return csharpReservedIdentifiers.has(value) ? `@${value}` : value;
}

export function requireCsharpIdentifier(
  value: string,
  diagnostics: TargetDiagnostic[],
  description: string,
): string {
  const identifier = tryCsharpIdentifier(value);
  if (identifier !== undefined) {
    return identifier;
  }
  diagnostics.push({
    code: "CSHARP_INVALID_IDENTIFIER",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} '${value}' is not a valid C# identifier. Add an explicit target name/fact instead of relying on backend name rewriting.`,
  });
  return "__invalid";
}

export function sanitizePathSegment(value: string): string {
  const identifier = tryCsharpIdentifier(value);
  if (identifier === undefined || identifier.startsWith("@")) {
    throw new Error(`Invalid C# path segment '${value}'. C# output paths must use canonical generated identities.`);
  }
  return identifier;
}

export function toPascalCase(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
  const name = words.map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`).join("");
  return sanitizeIdentifier(name.length === 0 ? "Module" : name);
}

const csharpReservedIdentifiers = new Set([
  "abstract",
  "as",
  "base",
  "bool",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "checked",
  "class",
  "const",
  "continue",
  "decimal",
  "default",
  "delegate",
  "do",
  "double",
  "else",
  "enum",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "fixed",
  "float",
  "for",
  "foreach",
  "goto",
  "if",
  "implicit",
  "in",
  "int",
  "interface",
  "internal",
  "is",
  "lock",
  "long",
  "namespace",
  "new",
  "null",
  "object",
  "operator",
  "out",
  "override",
  "params",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "return",
  "sbyte",
  "sealed",
  "short",
  "sizeof",
  "stackalloc",
  "static",
  "string",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "uint",
  "ulong",
  "unchecked",
  "unsafe",
  "ushort",
  "using",
  "virtual",
  "void",
  "volatile",
  "while",
]);
