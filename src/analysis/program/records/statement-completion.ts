import type { Node } from "@tsonic/tsts";
import type { SourceLabeledStatementTarget } from "@tsonic/target-api/source";
import type { CsharpControlExitCompletion, CsharpStatementCompletionRecords } from "../../../target-model/records/statement-completion.js";

export function createCsharpStatementCompletionRecords(input: {
  readonly exits: ReadonlyMap<Node, CsharpControlExitCompletion>;
  readonly labels: ReadonlyMap<Node, SourceLabeledStatementTarget>;
}): CsharpStatementCompletionRecords {
  return Object.freeze({
    controlExit: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.exits.get(subject) }),
    labeledStatement: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.labels.get(subject) }),
  });
}
