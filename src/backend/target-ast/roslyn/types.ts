export type CsharpTypeNode =
  | { readonly kind: "PredefinedType"; readonly name: string }
  | { readonly kind: "InvalidType"; readonly reason: string }
  | {
      readonly kind: "IdentifierName";
      readonly name: string;
      readonly typeArguments?: readonly CsharpTypeNode[];
      readonly requiredUsingNamespace?: string;
      readonly objectShapeIdentity?: string;
    }
  | { readonly kind: "QualifiedName"; readonly left: CsharpTypeNode; readonly name: string; readonly typeArguments?: readonly CsharpTypeNode[] }
  | { readonly kind: "AliasQualifiedName"; readonly alias: string; readonly name: CsharpTypeNode }
  | { readonly kind: "ArrayType"; readonly elementType: CsharpTypeNode; readonly rank?: number }
  | { readonly kind: "TupleType"; readonly elements: readonly CsharpTypeNode[] }
  | { readonly kind: "PointerType"; readonly pointee: CsharpTypeNode }
  | {
      readonly kind: "FunctionPointerType";
      readonly parameters: readonly CsharpTypeNode[];
      readonly returnType: CsharpTypeNode;
      readonly callingConvention?: "managed" | "unmanaged";
      readonly callingConventionModifiers?: readonly string[];
    }
  | { readonly kind: "NullableType"; readonly inner: CsharpTypeNode };
