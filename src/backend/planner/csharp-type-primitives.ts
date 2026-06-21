import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";

export function invalidCsharpType(reason: string): CsharpTypeNode {
  return { kind: "InvalidType", reason };
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "PredefinedType", name };
}
