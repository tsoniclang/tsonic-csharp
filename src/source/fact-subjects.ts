import type {
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";

export function asNodeSubject(subject: unknown): Node | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly Kind?: unknown }).Kind;
  return typeof kind === "number" || typeof kind === "string"
    ? subject as Node
    : undefined;
}

export function isNodeSubject(subject: unknown): subject is Node {
  return asNodeSubject(subject) !== undefined;
}

export function asSemanticType(subject: unknown): Type | undefined {
  return typeof subject === "object" && subject !== null && "flags" in subject
    ? subject as Type
    : undefined;
}

export function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}
