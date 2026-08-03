import type {
  DotnetTypeRef,
} from "./model-types.js";

export function dotnetTypeRefKey(type: DotnetTypeRef): string {
  switch (type.kind) {
    case "named":
      return `${type.targetId}<${(type.typeArguments ?? []).map(dotnetTypeRefKey).join(",")}>`;
    case "array":
      return `${dotnetTypeRefKey(type.elementType)}[${",".repeat((type.rank ?? 1) - 1)}]`;
    case "nullable":
      return `${dotnetTypeRefKey(type.elementType)}?`;
    case "nullable-reference":
      return `nullable-reference(${dotnetTypeRefKey(type.elementType)})`;
    case "tuple":
      return `[${type.elements.map(dotnetTypeRefKey).join(",")}]`;
    case "union":
      return type.types.map(dotnetTypeRefKey).join("|");
    case "function":
      return `fn:${type.id}(${type.parameters.map((parameter) => dotnetTypeRefKey(parameter.type)).join(",")})=>${dotnetTypeRefKey(type.returnType)}`;
    case "pointer":
      return `ptr(${dotnetTypeRefKey(type.pointee)})`;
    case "function-pointer":
      return `fnptr(${type.args.map(dotnetTypeRefKey).join(",")})=>${dotnetTypeRefKey(type.result)}`;
    case "opaque":
      return type.id;
    case "literal":
      return JSON.stringify(type.value);
    case "source-primitive":
    case "type-parameter":
      return type.name;
    default:
      return type.kind;
  }
}
