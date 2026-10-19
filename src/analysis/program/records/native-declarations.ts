import type { Node } from "@tsonic/tsts";
import type { CsharpNativeDeclarationRecords, CsharpNativeDeclarationForm } from "../../../target-model/records/native-declaration-forms.js";

export function createCsharpNativeDeclarationRecords(values: ReadonlyMap<Node, CsharpNativeDeclarationForm>): CsharpNativeDeclarationRecords {
  return Object.freeze({ nativeDeclaration: Object.freeze({ get: (subject: Node) => values.get(subject) }) });
}
