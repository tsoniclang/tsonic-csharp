import type { Node } from "@tsonic/tsts";
import type { CsharpDeclarationModifierRecords, CsharpMemberModifierSelection } from "../../../target-model/records/declaration-modifiers.js";

export function createCsharpDeclarationModifierRecords(values: ReadonlyMap<Node, CsharpMemberModifierSelection>): CsharpDeclarationModifierRecords {
  return Object.freeze({ memberModifiers: Object.freeze({ get: (subject: Node) => values.get(subject) }) });
}
