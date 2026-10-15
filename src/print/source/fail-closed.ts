export function failUnsupportedCsharpSyntax(node: unknown, category: string): never {
  const kind = typeof node === "object" && node !== null && "kind" in node
    ? String((node as { readonly kind?: unknown }).kind)
    : "<missing-kind>";
  throw new Error(`Unsupported C# ${category} syntax reached printer: ${kind}`);
}
