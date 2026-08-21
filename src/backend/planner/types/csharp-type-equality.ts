import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";

export function sameCsharpType(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "PredefinedType":
      return right.kind === "PredefinedType" && left.name === right.name;
    case "InvalidType":
      return right.kind === "InvalidType" && left.reason === right.reason;
    case "IdentifierName": {
      if (right.kind !== "IdentifierName" || left.name !== right.name) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "QualifiedName": {
      if (right.kind !== "QualifiedName" || left.name !== right.name || !sameCsharpType(left.left, right.left)) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "AliasQualifiedName":
      return right.kind === "AliasQualifiedName" &&
        left.alias === right.alias &&
        sameCsharpType(left.name, right.name);
    case "ArrayType":
      return right.kind === "ArrayType" && (left.rank ?? 1) === (right.rank ?? 1) && sameCsharpType(left.elementType, right.elementType);
    case "TupleType":
      return right.kind === "TupleType" &&
        left.elements.length === right.elements.length &&
        left.elements.every((element, index) => sameCsharpType(element, right.elements[index]!));
    case "PointerType":
      return right.kind === "PointerType" && sameCsharpType(left.pointee, right.pointee);
    case "FunctionPointerType":
      return right.kind === "FunctionPointerType" &&
        left.parameters.length === right.parameters.length &&
        left.parameters.every((parameter, index) => sameCsharpType(parameter, right.parameters[index]!)) &&
        sameCsharpType(left.returnType, right.returnType);
    case "NullableType":
      return right.kind === "NullableType" && sameCsharpType(left.inner, right.inner);
  }
}
