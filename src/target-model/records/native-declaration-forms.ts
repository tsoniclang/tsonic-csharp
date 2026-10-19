import type { Node } from "@tsonic/tsts";

export interface CsharpNativeEnumDeclaration {
  readonly kind: "enum";
  readonly integerWidth: 32 | 64;
  readonly members: readonly Node[];
}

export interface CsharpNativeDeclarationRecords {
  readonly nativeDeclaration: { readonly get: (subject: Node) => CsharpNativeDeclarationForm | undefined };
}

export interface CsharpNativeClassDeclaration {
  readonly kind: "class";
  readonly staticCompanion: {
    readonly name: string;
    readonly members: readonly Node[];
  } | undefined;
}

export type CsharpNativeDeclarationForm = CsharpNativeEnumDeclaration | CsharpNativeClassDeclaration;
