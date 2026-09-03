export function transformCsharpTargetAst<Value>(
  value: Value,
  transform: (record: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>,
): Value {
  return transformValue(value, transform) as Value;
}

function transformValue(
  value: unknown,
  transform: (record: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const elements = value.map((element) => {
      const transformed = transformValue(element, transform);
      changed ||= transformed !== element;
      return transformed;
    });
    return changed ? elements : value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record = value as Readonly<Record<string, unknown>>;
  let changed = false;
  const entries = Object.entries(record).map(([key, field]) => {
    const transformed = transformValue(field, transform);
    changed ||= transformed !== field;
    return [key, transformed] as const;
  });
  const children = changed ? Object.fromEntries(entries) : record;
  return transform(children);
}
