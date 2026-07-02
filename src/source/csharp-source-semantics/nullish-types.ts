import type {
  Type,
  TypeShapeQueries,
} from "@tsonic/tsts";

type NullishTypeShapeQueries = Pick<TypeShapeQueries, "isNever" | "isNullish" | "removeMissingOrUndefined">;

export function isTstsUndefinedType(
  type: Type | undefined,
  typeShape: NullishTypeShapeQueries | undefined,
): boolean {
  return type !== undefined &&
    typeShape !== undefined &&
    typeShape.isNullish(type) &&
    typeShape.isNever(typeShape.removeMissingOrUndefined(type));
}

export function isTstsNullType(
  type: Type | undefined,
  typeShape: NullishTypeShapeQueries | undefined,
): boolean {
  return type !== undefined &&
    typeShape !== undefined &&
    typeShape.isNullish(type) &&
    !isTstsUndefinedType(type, typeShape);
}
