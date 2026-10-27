import type { Node } from "@tsonic/tsts";
import type { CsharpNativeDeclarationRecords, CsharpNativeDeclarationForm } from "../../../../target-model/records/native/native-declaration-forms.js";
import type { CsharpProjectTypeHeritage } from "../../../../target-model/records/types/project-types.js";

export function createCsharpNativeDeclarationRecords(values: ReadonlyMap<Node, CsharpNativeDeclarationForm>, heritage: ReadonlyMap<Node, CsharpProjectTypeHeritage>): CsharpNativeDeclarationRecords {
  return Object.freeze({ nativeDeclaration: Object.freeze({ get: (subject: Node) => values.get(subject) }),
    declarationHeritage: Object.freeze({ get: (subject: Node) => heritage.get(subject) }),
  });
}
