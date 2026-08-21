import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";

export function invalidCsharpType(reason: string): CsharpTypeNode {
  return { kind: "InvalidType", reason };
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "PredefinedType", name };
}

export function qualifiedCsharpType(
  namespace: string,
  name: string,
  typeArguments?: readonly CsharpTypeNode[],
): CsharpTypeNode {
  const parts = namespace.split(".");
  let current: CsharpTypeNode = {
    kind: "IdentifierName",
    name: parts[0] ?? namespace,
  };
  for (const part of parts.slice(1)) {
    current = { kind: "QualifiedName", left: current, name: part };
  }
  return {
    kind: "QualifiedName",
    left: current,
    name,
    ...(typeArguments === undefined || typeArguments.length === 0
      ? {}
      : { typeArguments }),
  };
}

export function nullableCsharpType(type: CsharpTypeNode): CsharpTypeNode {
  return type.kind === "NullableType" || type.kind === "InvalidType"
    ? type
    : { kind: "NullableType", inner: type };
}
