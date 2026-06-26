import type {
  TargetTypeRef,
} from "@tsonic/tsts";

const implicitSourcePrimitiveConversions = new Map<string, ReadonlySet<string>>([
  ["int8", new Set(["int16", "int32", "int64", "float32", "float64", "decimal"])],
  ["uint8", new Set(["int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["int16", new Set(["int32", "int64", "float32", "float64", "decimal"])],
  ["uint16", new Set(["int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["char", new Set(["uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["int32", new Set(["int64", "float32", "float64", "decimal"])],
  ["uint32", new Set(["int64", "uint64", "float32", "float64", "decimal"])],
  ["int64", new Set(["float32", "float64", "decimal"])],
  ["uint64", new Set(["float32", "float64", "decimal"])],
  ["float32", new Set(["float64"])],
]);

const noImplicitSourcePrimitiveConversions: ReadonlySet<string> = new Set();

export function sourcePrimitiveImplicitlyConverts(expected: TargetTypeRef, actual: TargetTypeRef): boolean {
  if (expected.kind !== "source-primitive" || actual.kind !== "source-primitive") {
    return false;
  }
  return getImplicitSourcePrimitiveConversions(actual.name).has(expected.name);
}

function getImplicitSourcePrimitiveConversions(actual: string): ReadonlySet<string> {
  return implicitSourcePrimitiveConversions.get(actual) ?? noImplicitSourcePrimitiveConversions;
}
