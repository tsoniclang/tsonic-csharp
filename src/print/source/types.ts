import type { CsharpExpression, CsharpTypeNode } from "../../backend/target-ast/roslyn/index.js";
import { failUnsupportedCsharpSyntax } from "./fail-closed.js";

export function printCsharpType(type: CsharpTypeNode): string {
  switch (type.kind) {
    case "PredefinedType":
      return type.name;
    case "InvalidType":
      throw new Error(`Invalid C# type reached printer: ${type.reason}`);
    case "IdentifierName":
      return type.typeArguments === undefined || type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(printCsharpType).join(", ")}>`;
    case "QualifiedName": {
      const suffix = type.typeArguments === undefined || type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(printCsharpType).join(", ")}>`;
      return `${printCsharpType(type.left)}.${suffix}`;
    }
    case "AliasQualifiedName":
      return `${type.alias}::${printCsharpType(type.name)}`;
    case "ArrayType":
      return `${printCsharpType(type.elementType)}${printArrayRankSuffix(type.rank)}`;
    case "TupleType":
      return `(${type.elements.map(printCsharpType).join(", ")})`;
    case "PointerType":
      return `${printCsharpType(type.pointee)}*`;
    case "FunctionPointerType":
      return `delegate*<${[...type.parameters, type.returnType].map(printCsharpType).join(", ")}>`;
    case "NullableType":
      return `${printCsharpType(type.inner)}?`;
  }
  return failUnsupportedCsharpSyntax(type, "type");
}

export function isCsharpTypeSyntax(expression: CsharpExpression): expression is CsharpTypeNode {
  switch (expression.kind) {
    case "AliasQualifiedName":
    case "ArrayType":
    case "FunctionPointerType":
    case "IdentifierName":
    case "InvalidType":
    case "NullableType":
    case "PointerType":
    case "PredefinedType":
    case "QualifiedName":
    case "TupleType":
      return true;
    default:
      return false;
  }
}

function printArrayRankSuffix(rank: number | undefined): string {
  if (rank === undefined || rank <= 1) {
    return "[]";
  }
  return `[${",".repeat(rank - 1)}]`;
}
