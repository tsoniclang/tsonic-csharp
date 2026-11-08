import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpLexicalValueDeclaration {
  readonly declaration: Node;
  readonly carrier: TargetTypeRef;
  readonly references: readonly Node[];
}

export interface CsharpLexicalValueRecords {
  readonly lexicalValues: { readonly get: (statement: Node) => readonly CsharpLexicalValueDeclaration[] | undefined };
}
