import type { Node } from "@tsonic/tsts";
import type { SourceLabeledStatementTarget } from "@tsonic/target-api/source";
import type { CsharpReturnCompletion } from "../calls/returns.js";
import type { CsharpCatchBinding } from "./exception-flow.js";

export interface CsharpControlExitCompletion {
  readonly completion: "break" | "continue";
  readonly target: Node;
}

export interface CsharpStatementCompletionRecords {
  readonly controlExit: { readonly get: (subject: Node | undefined) => CsharpControlExitCompletion | undefined };
  readonly labeledStatement: { readonly get: (subject: Node | undefined) => SourceLabeledStatementTarget | undefined };
  readonly loopContinuationExit: { readonly get: (subject: Node | undefined) => boolean | undefined };
  readonly returnCompletion: { readonly get: (subject: Node | undefined) => CsharpReturnCompletion | undefined };
  readonly catchBinding: { readonly get: (subject: Node | undefined) => CsharpCatchBinding | undefined };
}
