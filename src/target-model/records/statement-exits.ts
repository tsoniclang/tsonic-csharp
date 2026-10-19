import type { Node } from "@tsonic/tsts";

export interface CsharpStatementExitRecords {
  readonly statementExit: {
    readonly get: (subject: Node | undefined) => boolean | undefined;
  };
}
