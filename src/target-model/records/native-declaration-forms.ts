import type { Node } from "@tsonic/tsts";
import type { CsharpProjectTypeHeritage } from "./project-types.js";

export interface CsharpNativeEnumDeclaration {
  readonly kind: "enum";
  readonly integerWidth: 32 | 64;
  readonly members: readonly Node[];
}

export interface CsharpNativeDeclarationRecords {
  readonly nativeDeclaration: { readonly get: (subject: Node) => CsharpNativeDeclarationForm | undefined };
  readonly declarationHeritage: { readonly get: (subject: Node) => CsharpProjectTypeHeritage | undefined };
}

export interface CsharpNativeClassDeclaration {
  readonly kind: "class";
  readonly staticCompanion: {
    readonly name: string;
    readonly members: readonly Node[];
  } | undefined;
}

export type CsharpNativeDeclarationForm = CsharpNativeEnumDeclaration | CsharpNativeClassDeclaration;
