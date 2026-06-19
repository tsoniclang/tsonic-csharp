export function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "_");
  if (sanitized.length === 0) {
    return "_";
  }
  const identifier = /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
  return csharpReservedIdentifiers.has(identifier) ? `@${identifier}` : identifier;
}

export function sanitizePathSegment(value: string): string {
  return sanitizeIdentifier(value).replace(/^_+$/, "_");
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
