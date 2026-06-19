export function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "_");
  if (sanitized.length === 0) {
    return "_";
  }
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

export function sanitizePathSegment(value: string): string {
  return sanitizeIdentifier(value).replace(/^_+$/, "_");
}

export function toPascalCase(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
  const name = words.map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`).join("");
  return sanitizeIdentifier(name.length === 0 ? "Module" : name);
}
