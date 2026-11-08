import type { TargetTypeRef } from "./native-type-data.js";
import { targetTypeRefEquals } from "./equality.js";
import { csharpTargetTypeComponents } from "./components.js";
import { csharpOptionalStorageDefinitionArities, csharpOptionalStorageDefinitionNames } from "./native-generics.js";
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

function csharpTypeIdentityAt(path: readonly (string | number)[]): boolean {
  return typeof path[0] === "number" && typePath(1);

  function final(offset: number): boolean { return offset === path.length; }
  function indexed(offset: number, next: (offset: number) => boolean): boolean {
    return typeof path[offset] === "number" && next(offset + 1);
  }
  function typePath(offset: number): boolean {
    const field = path[offset];
    if (field === "csharpDeclaration") return final(offset + 1);
    if (["element", "pointee", "result", "csharpBaseType", "csharpArrayLiteralElementType", "csharpArrayLiteralConstructionType",
      "csharpImplicitArrayInputElementType", "csharpEnumerableElementType", "csharpArrayLikeElementType", "csharpReadOnlyIndexableElementType",
      "csharpDenseMutableElementType", "csharpTaskResultType", "csharpExpressionTreeDelegateType"].includes(String(field))) return typePath(offset + 1);
    if (["typeArguments", "elements", "args", "csharpRuntimeUnionArms", "csharpRequirementDependencies"].includes(String(field))) return indexed(offset + 1, typePath);
    if (field === "csharpRuntimeUnionObjectShapes") return indexed(offset + 1, shapePath);
    if (field === "csharpDelegateSignature") return signaturePath(offset + 1);
    if (field === "csharpCallableMembers") return indexed(offset + 1, next => path[next] === "signature"
      ? signaturePath(next + 1) : path[next] === "typeParameters" && indexed(next + 1, parameterPath));
    if (field === "csharpConstraints") return path[offset + 1] === "constraints" && constraintsPath(offset + 2);
    if (field === "csharpProjection") return path[offset + 1] === "arguments" ? indexed(offset + 2, typePath)
      : path[offset + 1] === "definitions" && path[offset + 3] === "carrier" && typePath(offset + 4);
    if (field === "csharpMethodValue") return (path[offset + 1] === "owner" || path[offset + 1] === "contract") && typePath(offset + 2);
    if (field === "csharpClassFactory") return path[offset + 1] === "declaration" ? final(offset + 2)
      : path[offset + 1] === "instance" && typePath(offset + 2);
    if (field === "csharpGeneratorProtocol" || field === "csharpIteratorResultProtocol") return ["yieldType", "returnType", "nextType"].includes(String(path[offset + 1])) && typePath(offset + 2);
    if (field === "csharpIndexableReadMember") return ["declaringType", "returnType"].includes(String(path[offset + 1]))
      ? typePath(offset + 2) : path[offset + 1] === "parameters" && indexed(offset + 2, next => path[next] === "type" && typePath(next + 1));
    return false;
  }
  function signaturePath(offset: number): boolean {
    return path[offset] === "returnType" ? typePath(offset + 1) : path[offset] === "parameters" ? indexed(offset + 1, typePath)
      : path[offset] === "receiver" && path[offset + 1] === "type" && typePath(offset + 2);
  }
  function parameterPath(offset: number): boolean {
    return path[offset] === "declaration" ? final(offset + 1) : path[offset] === "constraints" && constraintsPath(offset + 1);
  }
  function constraintsPath(offset: number): boolean {
    return indexed(offset, next => path[next] === "type" && typePath(next + 1));
  }
  function shapePath(offset: number): boolean {
    if (path[offset] === "declarationTemplate") return shapePath(offset + 1);
    if (path[offset] === "targetType") return typePath(offset + 1);
    if (path[offset] === "implements") return indexed(offset + 1, typePath);
    if (path[offset] === "members") return indexed(offset + 1, memberPath);
    if (path[offset] !== "methodImplementation") return false;
    const field = path[offset + 1];
    if (field === "declaration") return final(offset + 2);
    if (field === "methods") return indexed(offset + 2, final);
    return field === "captures" && indexed(offset + 2, next => path[next] === "declaration" || path[next] === "reference"
      ? final(next + 1) : path[next] === "type" && typePath(next + 1));
  }
  function memberPath(offset: number): boolean {
    const field = path[offset];
    if (field === "sourceSubjects" || field === "sourceDeclarations") return indexed(offset + 1, final);
    if (field === "origins") return indexed(offset + 1, next => path[next] === "declaration" || path[next] === "owner"
      ? final(next + 1) : path[next] === "key" && path[next + 1] === "declaration" && final(next + 2));
    if (field === "type") return typePath(offset + 1);
    if (field === "methodValueStorage") return path[offset + 1] === "type" && typePath(offset + 2);
    return field === "methods" && indexed(offset + 1, next => (path[next] === "member" || path[next] === "value") &&
      (path[next + 1] === "signature" ? signaturePath(next + 2)
        : path[next + 1] === "typeParameters" && indexed(next + 2, parameterPath)));
  }
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
          !("csharpFlowRefinementRepresentation" in type) &&
          (type.csharpConstraintRequiresReferenceType === undefined ||
            type.csharpConstraintRequiresReferenceType === true && type.csharpValueType !== true && type.csharpByRefLike !== true &&
              (type.csharpSourceDeclarationKind === undefined || type.csharpSourceDeclarationKind === "class")) &&
          (type.typeArguments === undefined || list(type.typeArguments, depth)) &&
          permissions(type.csharpAllowsRefLikeTypeArguments, Array.isArray(type.typeArguments) ? type.typeArguments.length : 0) &&
          (type.csharpDelegateSignature === undefined || signature(type.csharpDelegateSignature, depth)) &&
          (type.csharpCallableMembers === undefined || type.csharpDelegateSignature === undefined && callableMembers(type.csharpCallableMembers, depth)) &&
          (type.csharpRuntimeUnionArms === undefined ? type.csharpRuntimeUnionSemantics === undefined
            : type.csharpRuntimeUnionSemantics === "native-ordered" &&
              Array.isArray(type.csharpRuntimeUnionArms) && list(type.csharpRuntimeUnionArms, depth) && Array.isArray(type.typeArguments) &&
              type.csharpRuntimeUnionArms.length === type.typeArguments.length &&
              type.csharpRuntimeUnionArms.every((arm, index) =>
                targetTypeRefEquals(arm, (type.typeArguments as readonly TargetTypeRef[])[index]!)));
        break;
      case "type-parameter": valid = string(type.identity) && string(type.name) &&
        (type.csharpDeclaration === undefined || typeof type.csharpDeclaration === "object" && type.csharpDeclaration !== null) &&
        (type.csharpRequirementDependencies === undefined || list(type.csharpRequirementDependencies, depth)) &&
        (type.csharpProjection === undefined || optionalProjection(type.csharpProjection, depth)) &&
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
  const optionalProjection = (input: unknown, depth: number): boolean => {
    if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
    const value = input as Readonly<Record<string, unknown>>;
    return Object.keys(value).length === 4 && value.kind === "optional" && (value.part === "storage" || value.part === "operations") &&
      Array.isArray(value.arguments) && value.arguments.length === 1 && list(value.arguments, depth + 1) && optionalDefinitions(value.definitions, depth + 1);
  };
  const optionalDefinitions = (input: unknown, depth: number): boolean => {
    if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
    const definitions = input as Readonly<Record<string, unknown>>;
    if (Object.keys(definitions).length !== csharpOptionalStorageDefinitionNames.length) return false;
    for (const name of csharpOptionalStorageDefinitionNames) {
      const input = definitions[name];
      if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
      const definition = input as Readonly<Record<string, unknown>>;
      if (Object.keys(definition).length !== 2 || !Array.isArray(definition.parameters) || !data(definition.parameters) ||
        definition.parameters.length !== csharpOptionalStorageDefinitionArities[name] ||
        Object.keys(definition.parameters).length !== definition.parameters.length || !definition.parameters.every(string) ||
        new Set(definition.parameters).size !== definition.parameters.length || !visit(definition.carrier, depth + 1)) return false;
      const carrier = definition.carrier as TargetTypeRef;
      const parameters = definition.parameters;
      if (carrier.kind !== "target-named" || (carrier.typeArguments?.length ?? 0) !== parameters.length ||
        carrier.typeArguments?.some((parameter, index) => parameter.kind !== "type-parameter" || parameter.identity !== parameters[index])) return false;
    }
    return true;
  };
  const passingMode = (input: unknown): boolean => input === "by-value" || input === "byref-readonly" ||
    input === "byref-readwrite" || input === "byref-writeonly-must-init";
  const signature = (input: unknown, depth: number): boolean => {
    if (typeof input !== "object" || input === null || Array.isArray(input) || !data(input)) return false;
    const value = input as Readonly<Record<string, unknown>>;
    if (value.kind !== "call" && value.kind !== "construct" || !Array.isArray(value.parameters) || !list(value.parameters, depth) ||
      !Array.isArray(value.parameterPassingModes) || !data(value.parameterPassingModes) ||
      value.parameterPassingModes.length !== value.parameters.length || !value.parameterPassingModes.every(passingMode) ||
      !visit(value.returnType, depth + 1)) return false;
    if (value.returnPassing !== undefined && value.returnPassing !== "byref-readonly" && value.returnPassing !== "byref-readwrite") return false;
    if (value.receiver !== undefined) {
      if (typeof value.receiver !== "object" || value.receiver === null || Array.isArray(value.receiver) || !data(value.receiver)) return false;
      const receiver = value.receiver as Readonly<Record<string, unknown>>;
      if (Object.keys(receiver).length !== 2 || !passingMode(receiver.passingMode) || !visit(receiver.type, depth + 1)) return false;
    }
    const parameters = value.parameters;
    if (value.optionalParameterIndexes !== undefined && (!Array.isArray(value.optionalParameterIndexes) ||
      !data(value.optionalParameterIndexes) || new Set(value.optionalParameterIndexes).size !== value.optionalParameterIndexes.length ||
      !value.optionalParameterIndexes.every(index => Number.isSafeInteger(index) && index >= 0 && index < parameters.length))) return false;
    return value.restParameterIndex === undefined || typeof value.restParameterIndex === "number" &&
      Number.isSafeInteger(value.restParameterIndex) && value.restParameterIndex === parameters.length - 1;
  };
  const callableMembers = (input: unknown, depth: number): boolean => {
    if (!Array.isArray(input) || !data(input) || input.length === 0 || Object.keys(input).length !== input.length) return false;
    const names = new Set<string>();
    for (const member of input) {
      if (typeof member !== "object" || member === null || Array.isArray(member) || !data(member)) return false;
      const value = member as Readonly<Record<string, unknown>>;
      if (Object.keys(value).length !== 3 || !string(value.name) || names.has(value.name) || !methodParameters(value.typeParameters, depth + 1) ||
        !signature(value.signature, depth + 1)) return false;
      names.add(value.name);
    }
    return true;
  };
  const methodParameters = (input: unknown, depth: number): boolean => {
    if (!Array.isArray(input) || !data(input) || Object.keys(input).length !== input.length) return false;
    if (input.length > maximumCsharpMetadataEntries - count) failCsharpMetadataResourceLimit("C# callable parameter validation", "entries", maximumCsharpMetadataEntries);
    const identities = new Set<string>();
    for (const parameter of input) {
      count += 1;
      if (typeof parameter !== "object" || parameter === null || Array.isArray(parameter) || !data(parameter)) return false;
      const value = parameter as Readonly<Record<string, unknown>>;
      const declared = Object.prototype.hasOwnProperty.call(value, "declaration");
      if (Object.keys(value).length !== (declared ? 4 : 3) ||
        declared && (typeof value.declaration !== "object" || value.declaration === null) ||
        !string(value.identity) || identities.has(value.identity) || !string(value.name) ||
        !constraintResolution({ kind: "resolved", constraints: value.constraints }, depth + 1)) return false;
      identities.add(value.identity);
    }
    return true;
  };
  return visit(value, 0);
}
