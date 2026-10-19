import type { Node } from "@tsonic/tsts";
import type { CsharpNativeDeclarationRecords, CsharpNativeEnumDeclaration } from "../../../target-model/records/native-declaration-forms.js";

export function createCsharpNativeDeclarationRecords(values: ReadonlyMap<Node, CsharpNativeEnumDeclaration>): CsharpNativeDeclarationRecords {
  return Object.freeze({ nativeDeclaration: Object.freeze({ get: (subject: Node) => values.get(subject) }) });
}
