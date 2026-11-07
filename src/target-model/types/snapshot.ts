import type { CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "./model.js";
import { targetTypeRefEquals } from "./equality.js";
import { csharpTargetTypeComponents } from "./components.js";
import { failCsharpMetadataResourceLimit, snapshotCsharpMetadata, csharpMetadataDescriptors, createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../metadata/immutable.js";

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
    if (visited.size >= maximumCsharpMetadataEntries) failCsharpMetadataResourceLimit("C# target type snapshot", "entries", maximumCsharpMetadataEntries);
    if (!isCsharpTargetTypeRef(type)) throw new TypeError("C# target type snapshot requires bounded valid carriers.");
    visited.add(type);
    const components = csharpTargetTypeComponents(type);
    budget.reserve(components.length);
    for (const component of components) pending.push(component);
  }
  return snapshot;
}

/** Q73: a source-sum carrier maps every present Host arm to a storage arm and uses every storage arm. */
function sourceSumSlots(type: Partial<CsharpRuntimeUnionTargetTypeRef>): boolean {
  const slots = type.csharpSourceSumSlots;
  const categories = type.csharpSourceSumKeyCategories;
  if (categories !== undefined && (!Array.isArray(categories) || slots === undefined || categories.length !== slots.length ||
    categories.some(category => typeof category !== "string"))) return false;
  if (slots === undefined) return type.csharpRuntimeUnionSemantics !== "source-sum";
  const arity = type.csharpRuntimeUnionArms?.length ?? 0;
  return type.csharpRuntimeUnionSemantics === "source-sum" && Array.isArray(slots) && slots.length >= arity &&
    slots.every(slot => Number.isInteger(slot) && slot >= 0 && slot < arity) &&
    Array.from({ length: arity }, (_, index) => index).every(index => slots.includes(index));
}

function csharpTypeIdentityAt(path: readonly (string | number)[]): boolean {
  const parent = path[path.length - 2];
  const key = path[path.length - 1];
  if (key === "csharpDeclaration") return true;
  // The Host refusal of a `refused` constraint resolution keeps its site nodes by identity.
  if (parent === "refusal" && (key === "site" || key === "related") && path[path.length - 3] === "csharpConstraints") return true;
  if (parent === "csharpClassFactory" && key === "declaration" ||
    parent === "csharpProjection" && (key === "declaration" || key === "source" || key === "sum")) return true;
  const shapeIndex = path.lastIndexOf("csharpRuntimeUnionObjectShapes");
  if (shapeIndex < 0 || typeof path[shapeIndex + 1] !== "number") return false;
  let offset = shapeIndex + 2;
  while (path[offset] === "declarationTemplate") offset += 1;
  const tail = path.slice(offset);
  if (tail.length === 1) return key === "sourceType";
  if (tail[0] === "members" && typeof tail[1] === "number") {
    if (tail[2] === "origins" && typeof tail[3] === "number") {
      return tail.length === 5 && (key === "declaration" || key === "owner") ||
        tail.length === 6 && tail[4] === "key" && key === "declaration";
    }
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
  const data = (input: object): boolean => {
    try { csharpMetadataDescriptors(input); return true; } catch { return false; }
  };
  const list = (input: unknown, depth: number): boolean => {
    if (!Array.isArray(input)) return false;
    if (!data(input) ||
        Object.keys(input).length !== input.length) return false;
    if (input.length > maximumCsharpMetadataEntries - count) failCsharpMetadataResourceLimit("C# target type validation", "entries", maximumCsharpMetadataEntries);
    for (let index = 0; index < input.length; index += 1) {
      if (!visit(input[index], depth + 1)) return false;
    }
    return true;
  };
  const permissions = (input: unknown, length: number): boolean => {
    if (!Array.isArray(input) || input.length !== length || !data(input) || Object.keys(input).length !== input.length) return false;
    for (let index = 0; index < input.length; index += 1) if (typeof input[index] !== "boolean") return false;
    return true;
  };
  const visit = (input: unknown, depth: number): boolean => {
    if (++count > maximumCsharpMetadataEntries) failCsharpMetadataResourceLimit("C# target type validation", "entries", maximumCsharpMetadataEntries);
    if (depth > maximumCsharpMetadataDepth) failCsharpMetadataResourceLimit("C# target type validation", "depth", maximumCsharpMetadataDepth);
    if (typeof input !== "object" || input === null || active.has(input)) return false;
    if (Array.isArray(input) || !data(input)) return false;
    const type = input as Readonly<Record<string, unknown>>;
    active.add(input);
    let valid = false;
    switch (type.kind) {
      case "source-primitive":
        valid = typeof type.name === "string" && ["bool", "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
          "native-int", "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"].includes(type.name);
        break;
      case "target-named":
        valid = string(type.id) &&
          (type.csharpConstraintRequiresReferenceType === undefined ||
            type.csharpConstraintRequiresReferenceType === true && type.csharpValueType !== true && type.csharpByRefLike !== true &&
              (type.csharpSourceDeclarationKind === undefined || type.csharpSourceDeclarationKind === "class")) &&
          (type.typeArguments === undefined || list(type.typeArguments, depth)) &&
          permissions(type.csharpAllowsRefLikeTypeArguments, Array.isArray(type.typeArguments) ? type.typeArguments.length : 0) &&
          (type.csharpRuntimeUnionArms === undefined ? type.csharpRuntimeUnionSemantics === undefined
            : (type.csharpRuntimeUnionSemantics === "native-ordered" || type.csharpRuntimeUnionSemantics === "source-sum") &&
              Array.isArray(type.csharpRuntimeUnionArms) && list(type.csharpRuntimeUnionArms, depth) && Array.isArray(type.typeArguments) &&
              type.csharpRuntimeUnionArms.length === type.typeArguments.length &&
              type.csharpRuntimeUnionArms.every((arm, index) =>
                targetTypeRefEquals(arm, (type.typeArguments as readonly TargetTypeRef[])[index]!)) &&
              sourceSumSlots(type as Partial<CsharpRuntimeUnionTargetTypeRef>));
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
    }
    active.delete(input);
    return valid;
  };
  const constraintResolution = (input: unknown, depth: number): boolean => {
    if (depth > maximumCsharpMetadataDepth) failCsharpMetadataResourceLimit("C# target constraint validation", "depth", maximumCsharpMetadataDepth);
    if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
    const resolution = input as Readonly<Record<string, unknown>>;
    const keys = Object.keys(resolution);
    if (resolution.kind === "unsupported") return keys.length === 2 && keys.includes("reason") && string(resolution.reason);
    if (resolution.kind === "refused") {
      const refusal = resolution.refusal as Readonly<Record<string, unknown>> | null | undefined;
      return keys.length === 2 && keys.includes("refusal") && typeof refusal === "object" && refusal !== null &&
        refusal.kind === "refused" && string(refusal.code) && typeof refusal.reason === "string" &&
        typeof refusal.site === "object" && refusal.site !== null;
    }
    if (resolution.kind !== "resolved" || keys.length !== 2 || !keys.includes("constraints") || !Array.isArray(resolution.constraints) ||
        !data(resolution.constraints) ||
        Object.keys(resolution.constraints).length !== resolution.constraints.length) return false;
    const constraints: readonly unknown[] = resolution.constraints;
    if (constraints.length > maximumCsharpMetadataEntries - count) failCsharpMetadataResourceLimit("C# target constraint validation", "entries", maximumCsharpMetadataEntries);
    for (const input of constraints) {
      if (++count > maximumCsharpMetadataEntries) failCsharpMetadataResourceLimit("C# target constraint validation", "entries", maximumCsharpMetadataEntries);
      if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
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
