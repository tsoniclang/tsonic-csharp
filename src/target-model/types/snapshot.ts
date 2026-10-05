import type { TargetTypeRef } from "./model.js";
import { csharpTargetTypeComponents } from "./components.js";
import { snapshotCsharpMetadata, createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../metadata/immutable.js";

export function snapshotCsharpTargetTypes(
  types: readonly TargetTypeRef[],
  budget = createCsharpMetadataBudget(),
): readonly TargetTypeRef[] {
  const snapshot = snapshotCsharpMetadata(types, csharpTypeIdentityAt, budget);
  const visited = new Set<object>();
  budget.reserve(snapshot.length);
  const pending = [...snapshot];
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index]!;
    if (visited.has(type)) continue;
    if (visited.size >= maximumCsharpMetadataEntries || !isCsharpTargetTypeRef(type)) throw new TypeError("C# target type snapshot requires bounded valid carriers.");
    visited.add(type);
    const components = csharpTargetTypeComponents(type);
    budget.reserve(components.length);
    for (const component of components) pending.push(component);
  }
  return snapshot;
}

function csharpTypeIdentityAt(path: readonly (string | number)[]): boolean {
  const parent = path[path.length - 2];
  const key = path[path.length - 1];
  if (key === "csharpDeclaration") return true;
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

export function isCsharpTargetTypeRef(value: unknown): value is TargetTypeRef {
  const active = new Set<object>();
  let count = 0;
  const string = (input: unknown): input is string => typeof input === "string" && input.length > 0;
  const list = (input: unknown, depth: number): boolean => {
    if (!Array.isArray(input) || input.length > maximumCsharpMetadataEntries - count) return false;
    for (let index = 0; index < input.length; index += 1) {
      if (!visit(input[index], depth + 1)) return false;
    }
    return true;
  };
  const visit = (input: unknown, depth: number): boolean => {
    if (++count > maximumCsharpMetadataEntries || depth > maximumCsharpMetadataDepth || typeof input !== "object" || input === null || active.has(input)) return false;
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
      case "type-parameter": valid = string(type.identity) && string(type.name) &&
        (type.csharpDeclaration === undefined || typeof type.csharpDeclaration === "object" && type.csharpDeclaration !== null) &&
        (type.csharpConstraints === undefined || constraintResolution(type.csharpConstraints, depth)); break;
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
  const constraintResolution = (input: unknown, depth: number): boolean => {
    if (typeof input !== "object" || input === null || depth > maximumCsharpMetadataDepth) return false;
    const resolution = input as Readonly<Record<string, unknown>>;
    const keys = Object.keys(resolution);
    if (resolution.kind === "unsupported") return keys.length === 2 && keys.includes("reason") && string(resolution.reason);
    if (resolution.kind !== "resolved" || keys.length !== 2 || !keys.includes("constraints") || !Array.isArray(resolution.constraints) ||
        resolution.constraints.length > maximumCsharpMetadataEntries - count) return false;
    const constraints: readonly unknown[] = resolution.constraints;
    for (const input of constraints) {
      if (++count > maximumCsharpMetadataEntries || typeof input !== "object" || input === null) return false;
      const constraint = input as Readonly<Record<string, unknown>>;
      const keys = Object.keys(constraint);
      if (constraint.kind === "type" ? keys.length !== 2 || !keys.includes("type") || !visit(constraint.type, depth + 1)
        : constraint.kind === "keyword" ? keys.length !== 2 || !keys.includes("keyword") ||
            typeof constraint.keyword !== "string" || !["class", "struct", "notnull", "unmanaged"].includes(constraint.keyword)
          : constraint.kind !== "constructor" || keys.length !== 1) return false;
    }
    return true;
  };
  return visit(value, 0);
}
