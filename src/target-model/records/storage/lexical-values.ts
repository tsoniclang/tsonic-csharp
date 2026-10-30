import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpLexicalValueDeclaration {
  readonly declaration: Node;
  readonly carrier: TargetTypeRef;
  readonly references: readonly Node[];
}

export interface CsharpLexicalValueRecords {
  readonly lexicalValues: { readonly get: (statement: Node) => readonly CsharpLexicalValueDeclaration[] | undefined };
}
