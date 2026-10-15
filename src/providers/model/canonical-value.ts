export function canonicalProviderValue(value: unknown): string {
  return JSON.stringify(canonicalizeProviderValue(value));
}

function canonicalizeProviderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeProviderValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizeProviderValue(child)]),
  );
}
