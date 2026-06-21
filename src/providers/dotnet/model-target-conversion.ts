import type {
  TargetConstraint,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetTypeRef,
} from "./model-types.js";
import {
  dotnetTypeRefKey,
} from "./model-type-ref-key.js";

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      return contract.kind === "target-named"
        ? {
            kind: "implements",
            contract: contract.id,
            ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
          }
        : { kind: "target-specific", target: "csharp", name: "implements", value: contract };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      return { kind: "target-specific", target: "csharp", name: "not-null" };
    case "target-specific":
      return { kind: "target-specific", target: "csharp", name: constraint.name, value: constraint.value };
  }
}

export function dotnetTypeRefToTargetTypeRef(type: DotnetTypeRef): TargetTypeRef {
  switch (type.kind) {
    case "void":
      return { kind: "opaque", id: "System.Void" };
    case "any":
    case "unknown":
      return { kind: "opaque", id: type.kind };
    case "object":
      return { kind: "target-named", id: "System.Object" };
    case "string":
      return { kind: "target-named", id: "System.String" };
    case "boolean":
      return { kind: "target-named", id: "System.Boolean" };
    case "number":
      return { kind: "target-named", id: "System.Double" };
    case "bigint":
      return { kind: "target-named", id: "System.Numerics.BigInteger" };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "named":
      return {
        kind: "target-named",
        id: type.metadataName,
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToTargetTypeRef) } : {}),
      };
    case "array":
      return {
        kind: "array",
        element: dotnetTypeRefToTargetTypeRef(type.elementType),
        ...(type.rank !== undefined ? { rank: type.rank } : {}),
      };
    case "tuple":
      return { kind: "tuple", elements: type.elements.map(dotnetTypeRefToTargetTypeRef) };
    case "union":
      return { kind: "opaque", id: `csharp.union:${type.types.map(dotnetTypeRefKey).join("|")}` };
    case "function":
      return {
        kind: "target-named",
        id: type.returnType.kind === "void"
          ? `System.Action\`${type.parameters.length}`
          : `System.Func\`${type.parameters.length + 1}`,
        typeArguments: [
          ...type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
          ...(type.returnType.kind === "void" ? [] : [dotnetTypeRefToTargetTypeRef(type.returnType)]),
        ],
      };
    case "pointer":
      return { kind: "pointer", pointee: dotnetTypeRefToTargetTypeRef(type.pointee), mutability: type.mutability };
    case "function-pointer":
      return {
        kind: "function-pointer",
        args: type.args.map(dotnetTypeRefToTargetTypeRef),
        result: dotnetTypeRefToTargetTypeRef(type.result),
        ...(type.abi !== undefined ? { abi: type.abi } : {}),
      };
    case "opaque":
      return { kind: "opaque", id: type.id };
  }
}
