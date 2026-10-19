import type { Node } from "@tsonic/tsts";
import type { SourceLabeledStatementTarget } from "@tsonic/target-api/source";
import type { CsharpReturnCompletion } from "../../../target-model/records/returns.js";
import type { CsharpCatchBinding } from "../../../target-model/records/exception-flow.js";
import type { CsharpControlExitCompletion, CsharpStatementCompletionRecords } from "../../../target-model/records/statement-completion.js";

export function createCsharpStatementCompletionRecords(input: {
  readonly exits: ReadonlyMap<Node, CsharpControlExitCompletion>;
  readonly labels: ReadonlyMap<Node, SourceLabeledStatementTarget>;
  readonly continuations: ReadonlyMap<Node, boolean>;
  readonly returns: ReadonlyMap<Node, CsharpReturnCompletion>;
  readonly catches: ReadonlyMap<Node, CsharpCatchBinding>;
}): CsharpStatementCompletionRecords {
  return Object.freeze({
    controlExit: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.exits.get(subject) }),
    labeledStatement: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.labels.get(subject) }),
    loopContinuationExit: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.continuations.get(subject) }),
    returnCompletion: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.returns.get(subject) }),
    catchBinding: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : input.catches.get(subject) }),
  });
}
