import type { Node } from "@tsonic/tsts";
import type { CsharpLexicalValueRecords, CsharpLexicalValueDeclaration } from "../../../../target-model/records/storage/lexical-values.js";

export function createCsharpLexicalValueRecords(values: ReadonlyMap<Node, readonly CsharpLexicalValueDeclaration[]>): CsharpLexicalValueRecords {
  return Object.freeze({ lexicalValues: Object.freeze({ get: (statement: Node) => values.get(statement) }) });
}
