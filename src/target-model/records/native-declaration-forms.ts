import type { Node } from "@tsonic/tsts";

export interface CsharpNativeEnumDeclaration {
  readonly kind: "enum";
  readonly integerWidth: 32 | 64;
  readonly members: readonly Node[];
}

export interface CsharpNativeDeclarationRecords {
  readonly nativeDeclaration: { readonly get: (subject: Node) => CsharpNativeEnumDeclaration | undefined };
}
