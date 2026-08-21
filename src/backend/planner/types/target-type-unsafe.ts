import type { CsharpTypeNode } from "../../target-ast/roslyn/index.js";

export function csharpTypeRequiresUnsafe(type: CsharpTypeNode): boolean {
  switch (type.kind) {
    case "PointerType":
    case "FunctionPointerType":
      return true;
    case "ArrayType":
      return csharpTypeRequiresUnsafe(type.elementType);
    case "TupleType":
      return type.elements.some(csharpTypeRequiresUnsafe);
    case "NullableType":
      return csharpTypeRequiresUnsafe(type.inner);
    case "AliasQualifiedName":
      return csharpTypeRequiresUnsafe(type.name);
    case "IdentifierName":
    case "QualifiedName":
      return (type.typeArguments ?? []).some(csharpTypeRequiresUnsafe) ||
        (type.kind === "QualifiedName" && csharpTypeRequiresUnsafe(type.left));
    case "PredefinedType":
    case "InvalidType":
      return false;
  }
}
