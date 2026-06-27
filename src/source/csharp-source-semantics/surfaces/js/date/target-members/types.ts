import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../source-library.js";
import {
  csharpJsDateTargetType,
} from "../target-type.js";

const dateType = csharpJsDateTargetType();
const stringType = csharpStringTargetType();
const objectType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const intType = csharpSourcePrimitiveTargetType("int32");
const longType = csharpSourcePrimitiveTargetType("int64");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const nullableIntType = csharpNullableValueTargetType(intType);

export const dateTargetMemberTypes = {
  dateType,
  stringType,
  objectType,
  intType,
  longType,
  doubleType,
  nullableIntType,
};
