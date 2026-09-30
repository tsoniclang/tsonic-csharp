import type { TargetTypeRef } from "./model.js";
import { csharpTargetTypeComponents } from "./components.js";
import { snapshotCsharpMetadata } from "../metadata/immutable.js";

export function snapshotCsharpTargetTypes(types: readonly TargetTypeRef[]): readonly TargetTypeRef[] {
  const snapshot = snapshotCsharpMetadata(types, csharpTypeIdentityAt);
  const visited = new Set<object>();
  const pending = [...snapshot];
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index]!;
    if (visited.has(type)) continue;
    if (visited.size >= 1_048_576 || !isCsharpTargetTypeRef(type)) throw new TypeError("C# target type snapshot requires bounded valid carriers.");
    visited.add(type);
    pending.push(...csharpTargetTypeComponents(type));
  }
  return snapshot;
}

function csharpTypeIdentityAt(path: readonly (string | number)[]): boolean {
  const parent = path[path.length - 2];
  const key = path[path.length - 1];
  if (parent === "csharpClassFactory" && key === "declaration" ||
    parent === "csharpProjection" && key === "declaration" ||
    path[path.length - 3] === "csharpProjection" && parent === "sourceArguments" && typeof key === "number") return true;
  const shapeIndex = path.lastIndexOf("csharpRuntimeUnionObjectShapes");
  if (shapeIndex < 0 || typeof path[shapeIndex + 1] !== "number") return false;
  let offset = shapeIndex + 2;
  while (path[offset] === "declarationTemplate") offset += 1;
  const tail = path.slice(offset);
  if (tail.length === 1) return key === "sourceType";
  if (tail[0] === "members" && typeof tail[1] === "number") {
    return tail.length === 4 && ["sourceSubjects", "sourceDeclarations", "sourceTypes"].includes(String(tail[2])) && typeof key === "number" ||
      tail.length === 5 && tail[2] === "typeParameters" && typeof tail[3] === "number" && key === "declaration";
  }
  return tail[0] === "methodImplementation" && (tail.length === 2 && key === "declaration" ||
    tail.length === 4 && tail[1] === "captures" && typeof tail[2] === "number" && (key === "declaration" || key === "reference"));
}

function isCsharpTargetTypeRef(value: unknown): value is TargetTypeRef {
  const active = new Set<object>();
  let count = 0;
  const string = (input: unknown): input is string => typeof input === "string" && input.length > 0;
  const list = (input: unknown, depth: number): boolean => {
    if (!Array.isArray(input) || input.length > 1_048_576 - count) return false;
    for (let index = 0; index < input.length; index += 1) {
      if (!visit(input[index], depth + 1)) return false;
    }
    return true;
  };
  const visit = (input: unknown, depth: number): boolean => {
    if (++count > 1_048_576 || depth > 128 || typeof input !== "object" || input === null || active.has(input)) return false;
    if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) return false;
    const type = input as Readonly<Record<string, unknown>>;
    active.add(input);
    let valid = false;
    switch (type.kind) {
      case "source-primitive":
        valid = typeof type.name === "string" && ["bool", "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
          "native-int", "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"].includes(type.name);
        break;
      case "source-global":
      case "target-named":
        valid = string(type.kind === "source-global" ? type.name : type.id) &&
          (type.typeArguments === undefined || list(type.typeArguments, depth));
        break;
      case "type-parameter": valid = string(type.identity) && string(type.name); break;
      case "array": valid = (type.rank === undefined || typeof type.rank === "number" && Number.isInteger(type.rank) && type.rank > 0) && visit(type.element, depth + 1); break;
      case "tuple": valid = list(type.elements, depth); break;
      case "pointer": valid = (type.mutability === undefined || type.mutability === "const" || type.mutability === "mut" || type.mutability === "target-defined") && visit(type.pointee, depth + 1); break;
      case "function-pointer": valid = list(type.args, depth) && visit(type.result, depth + 1) &&
        (type.abi === undefined || Array.isArray(type.abi) && type.abi.every(string)); break;
      case "opaque": valid = string(type.id); break;
      case "associated-type": valid = string(type.name) && visit(type.owner, depth + 1); break;
      case "lifetime": valid = string(type.name); break;
      case "target-specific": valid = string(type.target) && string(type.name) && (type.payloadId === undefined || string(type.payloadId)); break;
    }
    active.delete(input);
    return valid;
  };
  return visit(value, 0);
}
