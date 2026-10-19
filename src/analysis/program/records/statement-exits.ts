import type { Node } from "@tsonic/tsts";
import type { CsharpStatementExitRecords } from "../../../target-model/records/statement-exits.js";

export function createCsharpStatementExitRecords(
  exits: ReadonlyMap<Node, boolean>,
): CsharpStatementExitRecords {
  return Object.freeze({ statementExit: Object.freeze({
    get: (subject: Node | undefined) => subject === undefined ? undefined : exits.get(subject),
  }) });
}
