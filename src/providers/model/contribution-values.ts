export function hasExactContributionFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  const allowedFields = new Set(allowed);
  return Object.keys(value).every((field) => allowedFields.has(field));
}

export function nonEmptyContributionString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isContributionRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function freezeContributionValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeContributionValue(entry))) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .map(([key, child]) => [key, freezeContributionValue(child)]),
    )) as T;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new Error(
      "C# target contributions must contain immutable data, not executable or symbolic values.",
    );
  }
  return value;
}
