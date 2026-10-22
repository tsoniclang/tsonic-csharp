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

/**
 * Spells an authored source name as a fragment of a generated C# identifier: ASCII letters, digits and `_` stay, every
 * other UTF-16 code unit is written as `x` and its four hexadecimal digits (`$done` → `x0024done`). The fragment is
 * never a whole identifier; generated names prefix it and add their own unique counter.
 */
export function csharpIdentifierFragment(value: string): string {
  let fragment = "";
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    const char = value[index]!;
    fragment += /[A-Za-z0-9_]/.test(char) ? char : `x${unit.toString(16).padStart(4, "0")}`;
  }
  return fragment;
}

export function isPlainCsharpIdentifier(value: string): boolean {
  return tryCsharpIdentifier(value) === value;
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
