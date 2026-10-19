import type { Node } from "@tsonic/tsts";

export interface CsharpMethodDeclarationEmission {
  readonly name: string;
}

export interface CsharpMethodEmissionRecords {
  readonly methodDeclaration: { readonly get: (subject: Node) => CsharpMethodDeclarationEmission | undefined };
}
