import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";

export function csharpTupleType(elements: readonly CsharpTypeNode[]): CsharpTypeNode {
  return elements.length >= 2
    ? { kind: "TupleType", elements }
    : csharpValueTupleType(elements);
}

export function csharpTupleExpression(
  elements: readonly CsharpExpression[],
  tupleType: CsharpTypeNode,
): CsharpExpression {
  return elements.length >= 2
    ? { kind: "TupleExpression", elements }
    : {
        kind: "ObjectCreationExpression",
        type: tupleType,
        arguments: elements.map((expression) => ({ kind: "Argument" as const, expression })),
      };
}

function csharpValueTupleType(elements: readonly CsharpTypeNode[]): CsharpTypeNode {
  const valueTupleName: CsharpTypeNode = {
    kind: "QualifiedName",
    left: { kind: "IdentifierName", name: "System" },
    name: "ValueTuple",
    ...(elements.length === 0 ? {} : { typeArguments: elements }),
  };
  return valueTupleName;
}
