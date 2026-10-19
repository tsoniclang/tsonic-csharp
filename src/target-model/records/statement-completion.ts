import type { Node } from "@tsonic/tsts";
import type { SourceLabeledStatementTarget } from "@tsonic/target-api/source";

export interface CsharpControlExitCompletion {
  readonly completion: "break" | "continue";
  readonly target: Node;
}

export interface CsharpStatementCompletionRecords {
  readonly controlExit: { readonly get: (subject: Node | undefined) => CsharpControlExitCompletion | undefined };
  readonly labeledStatement: { readonly get: (subject: Node | undefined) => SourceLabeledStatementTarget | undefined };
  readonly loopContinuationExit: { readonly get: (subject: Node | undefined) => boolean | undefined };
}
