export function csharpMetadataDescriptors(input: object): Readonly<Record<string, PropertyDescriptor>> {
  const prototype = Object.getPrototypeOf(input);
  if (Array.isArray(input) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("C# immutable metadata requires plain data records.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !("value" in descriptors[key]!))) {
    throw new TypeError("C# immutable metadata cannot contain accessors or symbol keys.");
  }
  return descriptors;
}

export function snapshotCsharpMetadata<Value>(
  value: Value,
  identityAt?: (path: readonly (string | number)[]) => boolean,
): Value {
  const copies = new Map<object, unknown>();
  const active = new Set<object>();
  let count = 0;
  const copy = (input: unknown, depth: number, path: readonly (string | number)[]): unknown => {
    if (++count > 1_048_576 || depth > 128) throw new TypeError("C# immutable metadata exceeds its finite resource budget.");
    if (input === undefined || input === null || typeof input === "string" || typeof input === "boolean" ||
      typeof input === "bigint" || typeof input === "number") return input;
    if (typeof input !== "object") throw new TypeError("C# immutable metadata requires data values.");
    if (identityAt?.(path) === true) return input;
    if (active.has(input)) throw new TypeError("C# immutable metadata contains a cycle.");
    if (copies.has(input)) return copies.get(input);
    const descriptors = csharpMetadataDescriptors(input);
    const keys = Object.keys(descriptors);
    active.add(input);
    let result: unknown;
    if (Array.isArray(input)) {
      if (input.length > 1_048_576 - count || keys.length !== input.length + 1) {
        throw new TypeError("C# immutable metadata requires bounded dense arrays.");
      }
      const entries: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor === undefined) throw new TypeError("C# immutable metadata requires dense arrays.");
        entries.push(copy(descriptor.value, depth + 1, identityAt === undefined ? path : [...path, index]));
      }
      result = Object.freeze(entries);
    } else {
      result = Object.freeze(Object.fromEntries(keys.map(key => [key, copy(descriptors[key]!.value, depth + 1,
        identityAt === undefined ? path : [...path, key])])));
    }
    active.delete(input);
    copies.set(input, result);
    return result;
  };
  return copy(value, 0, []) as Value;
}
