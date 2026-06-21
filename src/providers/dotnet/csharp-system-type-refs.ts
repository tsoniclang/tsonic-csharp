import type {
  DotnetTypeRef,
} from "./model.js";
import {
  namedType,
  sourcePrimitiveType,
  typeParameterType,
} from "./csharp-system-provider-builders.js";

export const stringType = namedType("System.String", { kind: "string" });
export const boolType = sourcePrimitiveType("bool");
export const intType = sourcePrimitiveType("int32");
export const doubleType = sourcePrimitiveType("float64");
export const voidType = { kind: "void" } satisfies DotnetTypeRef;
export const listItemType = typeParameterType("T");
