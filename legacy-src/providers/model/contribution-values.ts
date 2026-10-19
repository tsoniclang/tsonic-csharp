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
